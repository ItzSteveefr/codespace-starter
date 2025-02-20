'use client';
import { useState, useEffect } from 'react';

// Define interfaces for the GitHub API responses
interface Repository {
  name: string;
  full_name: string;
}

interface Codespace {
  id: string;
  name: string;
  state: string;
  repository: Repository;
}

type CodespaceStatus = 
  | 'checking'
  | 'running'
  | 'stopped'
  | 'starting'
  | 'not_found'
  | 'app_not_running'
  | 'error'
  | 'no_token';

export default function Home() {
  const [status, setStatus] = useState<CodespaceStatus>('checking');
  const [codespaceUrl, setCodespaceUrl] = useState<string>('');
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [codespaceId, setCodespaceId] = useState<string>('');
  const FLASK_PORT = 8080;
  
  // Replace these with your actual values
  const GITHUB_TOKEN = process.env.NEXT_PUBLIC_GITHUB_TOKEN;
  const REPO_NAME = 'Fake-Text-Story';
  const OWNER = 'ItzSteveefr';

  const checkCodespaceStatus = async (): Promise<void> => {
    try {
      if (!GITHUB_TOKEN) {
        setStatus('no_token');
        return;
      }

      // First, get list of codespaces
      const response = await fetch(
        `https://api.github.com/user/codespaces`,
        {
          headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );
      
      const codespaces: Codespace[] = await response.json();
      const codespace = codespaces.find((cs: Codespace) => cs.repository.name === REPO_NAME);
      
      if (!codespace) {
        setStatus('not_found');
        return;
      }

      // Store codespace ID
      setCodespaceId(codespace.id);

      // Check if codespace is running
      if (codespace.state === 'running') {
        const url = `https://${codespace.name}-${FLASK_PORT}.app.github.dev`;
        setCodespaceUrl(url);
        
        // Verify Flask app is responding
        try {
          const healthCheck = await fetch(`${url}/health`);
          if (healthCheck.ok) {
            setStatus('running');
            return;
          }
        } catch (e) {
          // Flask app not responding
          setStatus('app_not_running');
        }
      }
      
      setStatus(codespace.state as CodespaceStatus);
      
    } catch (error) {
      console.error('Error checking status:', error);
      setStatus('error');
    }
  };

  const startCodespace = async (): Promise<void> => {
    try {
      if (!codespaceId) {
        throw new Error('No codespace ID available');
      }

      setIsStarting(true);
      
      // Start the codespace
      const startResponse = await fetch(
        `https://api.github.com/user/codespaces/${codespaceId}/start`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (!startResponse.ok) {
        throw new Error('Failed to start codespace');
      }

      // Wait for codespace to be running
      let attempts = 0;
      while (attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await checkCodespaceStatus();
        
        if (status === 'running') {
          // Start Flask app
          await fetch(
            `https://api.github.com/user/codespaces/${codespaceId}/console`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
              },
              body: JSON.stringify({
                command: 'python app.py',
                tty: true
              })
            }
          );
          break;
        }
        attempts++;
      }
      
    } catch (error) {
      console.error('Error starting codespace:', error);
      setStatus('error');
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    checkCodespaceStatus();
    const interval = setInterval(checkCodespaceStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: CodespaceStatus): string => {
    switch (status) {
      case 'running':
        return 'bg-green-100 text-green-700';
      case 'error':
      case 'no_token':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-yellow-100 text-yellow-700';
    }
  };

  const getStatusMessage = (status: CodespaceStatus): string => {
    switch (status) {
      case 'running':
        return 'Application is Running';
      case 'stopped':
        return 'Codespace is Stopped';
      case 'starting':
        return 'Codespace is Starting...';
      case 'not_found':
        return 'Codespace Not Found';
      case 'app_not_running':
        return 'Flask App Not Running';
      case 'error':
        return 'Error Checking Status';
      case 'no_token':
        return 'GitHub Token Not Found';
      default:
        return 'Checking Status...';
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-xl">
        <h1 className="text-2xl font-bold mb-6 text-center">
          Fake Text Story Control Panel
        </h1>
        
        {!GITHUB_TOKEN ? (
          <div className="p-4 rounded-md mb-4 text-center bg-red-100 text-red-700">
            GitHub token not found. Please set NEXT_PUBLIC_GITHUB_TOKEN in your environment.
          </div>
        ) : (
          <>
            <div className={`p-4 rounded-md mb-4 text-center ${getStatusColor(status)}`}>
              {getStatusMessage(status)}
            </div>

            {status === 'running' && (
              <a
                href={codespaceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 text-center"
              >
                Open Application
              </a>
            )}

            {(status === 'stopped' || status === 'error' || status === 'app_not_running') && (
              <button
                onClick={startCodespace}
                disabled={isStarting}
                className={`w-full py-2 px-4 rounded text-white ${
                  isStarting ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                {isStarting ? 'Starting...' : 'Start Codespace'}
              </button>
            )}

            {isStarting && (
              <div className="mt-4 text-sm text-gray-600">
                This may take a few minutes...
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}