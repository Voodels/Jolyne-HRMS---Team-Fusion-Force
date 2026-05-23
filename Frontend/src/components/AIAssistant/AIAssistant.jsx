import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Sidebar from '../Sidebar/Sidebar';
import TopBar from '../TopBar/TopBar';
import {
  startSession,
  sendMessage,
  approveAction,
  getHistory,
  refreshSchema,
} from '../../api/chatbotApi';
import { getAuthSession } from '../../api/authApi';
import { DEFAULT_APP_PERMISSIONS, loadAppPermissions } from '../../api/permissionApi';
import './AIAssistant.css';

function AIAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkingPreview, setThinkingPreview] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState('');
  const [schemaStatus, setSchemaStatus] = useState('');
  const [schemaRefreshing, setSchemaRefreshing] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const bottomRef = useRef(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [appPermissions, setAppPermissions] = useState(DEFAULT_APP_PERMISSIONS);

  const suggestedQuestions = [
    "How many candidates?",
    "Show all candidates",
    "Top skills in database",
    "Candidates with Java experience",
    "Average years of experience"
  ];

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinkingPreview, pendingAction]);

  useEffect(() => {
    const restore = async () => {
      const stored = localStorage.getItem('chatSessionId');
      if (!stored) return;
      setSessionId(stored);
      try {
        console.log('[chat] loading history', { sessionId: stored });
        const history = await getHistory(stored);
        console.log('[chat] history response', history);
        const mapped = history.messages.map((msg, index) => ({
          id: `history-${index}`,
          role: msg.role,
          text: msg.content,
          time: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
        setMessages(mapped);
      } catch (err) {
        console.error(err);
      }
    };

    restore();
  }, []);

  useEffect(() => {
    if (sessionId) {
      localStorage.setItem('chatSessionId', sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    setCurrentUser(getAuthSession());
    setAppPermissions(loadAppPermissions());
  }, []);

  const ensureSession = async () => {
    if (sessionId) return sessionId;
    console.log('[chat] starting new session');
    const started = await startSession();
    console.log('[chat] session created', started);
    setSessionId(started.session_id);
    return started.session_id;
  };

  const streamText = useCallback((text, callback) => {
    setIsStreaming(true);
    setStreamingText('');
    const words = text.split(/\s+/);
    let index = 0;

    const interval = setInterval(() => {
      if (index < words.length) {
        setStreamingText(prev => prev + (prev ? ' ' : '') + words[index]);
        index++;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
        callback();
      }
    }, 30); // 30ms per word for smooth effect

    return () => clearInterval(interval);
  }, []);

  const handleSend = async (textOverride = null) => {
    // If this was invoked as an event handler, ignore the event object
    if (textOverride && typeof textOverride === 'object' && !String(textOverride)) {
      textOverride = null;
    }
    const text = (typeof textOverride === 'string' ? textOverride : input || '').trim();
    if (!text) return;

    const userMsg = {
      id: Date.now(),
      role: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textOverride) setInput('');
    setLoading(true);
    setError('');
    setShowSuggestions(false);

    try {
      const activeSession = await ensureSession();
      console.log('[chat] sending message', { sessionId: activeSession, message: text });
      const response = await sendMessage({ sessionId: activeSession, message: text });
      console.log('[chat] message response', response);

      setThinkingPreview(response.thinking_preview || '');

      if (response.pending_action) {
        console.log('[chat] pending action received', response.pending_action);
        setPendingAction(response.pending_action);
        setThinkingPreview('');
      } else if (response.assistant_message) {
        console.log('[chat] assistant message received');
        setThinkingPreview('');
        
        // Stream the text animation
        streamText(response.assistant_message, () => {
          const aiMsg = {
            id: Date.now() + 1,
            role: 'ai',
            text: response.assistant_message,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setMessages((prev) => [...prev, aiMsg]);
          setStreamingText('');
        });
      }
    } catch (err) {
      console.error(err);
      setError('Unable to reach the chatbot service.');
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (question) => {
    handleSend(question);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const regenerateResponse = async () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      handleSend(lastUserMsg.text);
    }
  };

  const handleDecision = async (decision) => {
    if (!pendingAction) return;
    setLoading(true);
    setError('');

    try {
      console.log('[chat] decision submit', { actionId: pendingAction.id, decision });
      const response = await approveAction({
        actionId: pendingAction.id,
        decision,
      });
      console.log('[chat] decision response', response);
      const aiMsg = {
        id: Date.now() + 2,
        role: 'ai',
        text: response.assistant_message || 'No response returned.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setThinkingPreview('');
      setPendingAction(null);
    } catch (err) {
      console.error(err);
      setError('Approval request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMessageContent = (text) => {
    // Normalize non-string values so we can safely call string methods
    let content = text;
    if (typeof content !== 'string') {
      try {
        content = JSON.stringify(content, null, 2);
      } catch (e) {
        content = String(content);
      }
    }

    // Check if it's a table-like structure (SQL results often have | or ----)
    const isTable = content.includes('|') && (content.includes('---') || content.includes('candidate') || content.includes('name') || content.includes('email'));

    if (isTable) {
      // Try to parse and render as HTML table
      return <SQLTable content={content} />;
    }

    return (
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }) {
            return inline ? (
              <code className="inline-code" {...props}>{children}</code>
            ) : (
              <pre className="code-block"><code {...props}>{children}</code></pre>
            );
          },
          table({ children }) {
            return <table className="sql-table">{children}</table>;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    );
  };

  const MessageActions = ({ text, onRegenerate }) => (
    <div className="message-actions">
      <button className="msg-action-btn" onClick={() => copyToClipboard(text)} title="Copy">
        📋
      </button>
      <button className="msg-action-btn" onClick={onRegenerate} title="Regenerate">
        🔄
      </button>
      <button className="msg-action-btn" title="Helpful">
        👍
      </button>
      <button className="msg-action-btn" title="Not helpful">
        👎
      </button>
    </div>
  );

  const handleClearChat = () => {
    setMessages([]);
    setThinkingPreview('');
    setPendingAction(null);
    setError('');
    setSchemaStatus('');
    localStorage.removeItem('chatSessionId');
    setSessionId(null);
  };

  const handleRefreshSchema = async () => {
    setSchemaRefreshing(true);
    setSchemaStatus('Refreshing schema...');
    setError('');

    try {
      const response = await refreshSchema();
      const count = response?.table_count ?? 0;
      setSchemaStatus(`Schema refreshed. Tables: ${count}.`);
    } catch (err) {
      console.error(err);
      setSchemaStatus('');
      setError('Schema refresh failed.');
    } finally {
      setSchemaRefreshing(false);
    }
  };

  if (!appPermissions.allowAIService) {
    return (
      <div className="app-layout">
        <Sidebar isOpen={isSidebarOpen} />
        <div className={`app-content ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
          <TopBar toggleSidebar={toggleSidebar} />
          <main className="ai-main">
            <div className="ai-disabled-panel">
              <h3>AI Assistant Disabled</h3>
              <p>The AI service is currently turned off by the director.</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar isOpen={isSidebarOpen} />
      <div className={`app-content ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <TopBar toggleSidebar={toggleSidebar} />
        <main className="ai-main">
          <div className="ai-chat-wrapper">
            {/* Chat Header */}
            <div className="ai-chat-header">
              <div className="ai-header-left">
                <div className="ai-bot-avatar">🤖</div>
                <div>
                  <h3 className="ai-title">AI Recruitment Assistant</h3>
                  <p className="ai-subtitle">Ask me anything about candidates.</p>
                </div>
              </div>
              <div className="ai-header-actions">
                <button
                  className="btn-refresh-schema"
                  onClick={handleRefreshSchema}
                  disabled={schemaRefreshing}
                >
                  {schemaRefreshing ? 'Refreshing...' : 'Refresh Schema'}
                </button>
                <button className="btn-clear-chat" onClick={handleClearChat}>
                  Clear Chat
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="ai-messages">
              {messages.map((msg, index) => (
                <div key={msg.id} className={`message-row ${msg.role}`}>
                  {msg.role === 'ai' && (
                    <div className="ai-msg-avatar">🤖</div>
                  )}
                  <div className={`message-bubble ${msg.role}`}>
                    <>
                      <div className="msg-text markdown-content">
                        {renderMessageContent(msg.text)}
                      </div>
                      <span className="msg-time">{msg.time}</span>
                      {msg.role === 'ai' && (
                        <MessageActions 
                          text={msg.text} 
                          onRegenerate={index === messages.length - 1 ? regenerateResponse : null}
                        />
                      )}
                    </>
                  </div>
                </div>
              ))}

              {thinkingPreview && (
                <div className="message-row ai thinking-row">
                  <div className="ai-msg-avatar">🤖</div>
                  <div className="message-bubble ai thinking">
                    <div className="thinking-indicator">
                      <span className="thinking-dot"></span>
                      <span className="thinking-dot"></span>
                      <span className="thinking-dot"></span>
                    </div>
                    <p className="msg-text thinking-text">{thinkingPreview}</p>
                    <span className="msg-time">thinking...</span>
                  </div>
                </div>
              )}

              {isStreaming && streamingText && (
                <div className="message-row ai streaming-row">
                  <div className="ai-msg-avatar">🤖</div>
                  <div className="message-bubble ai streaming">
                    <p className="msg-text">{streamingText}</p>
                    <span className="streaming-cursor">▊</span>
                  </div>
                </div>
              )}

              {loading && (
                <div className="message-row ai">
                  <div className="ai-msg-avatar">🤖</div>
                  <div className="message-bubble ai typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {pendingAction && (
              <div className="approval-card">
                <div className="approval-title">Approval required</div>
                <div className="approval-subtitle">SQL query</div>
                <pre className="approval-sql">
                  {pendingAction.tool_args?.query || 'No query provided'}
                </pre>
                <div className="approval-actions">
                  <button
                    className="approval-btn approve"
                    onClick={() => handleDecision('approve')}
                    disabled={loading}
                  >
                    Approve
                  </button>
                  <button
                    className="approval-btn deny"
                    onClick={() => handleDecision('deny')}
                    disabled={loading}
                  >
                    Deny
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="approval-error">{error}</div>
            )}

            {schemaStatus && !error && (
              <div className="schema-status">{schemaStatus}</div>
            )}

            {/* Suggested Questions */}
            {showSuggestions && messages.length === 0 && (
              <div className="suggested-questions">
                <p className="suggestions-label">Try asking:</p>
                <div className="suggestion-chips">
                  {suggestedQuestions.map((q, i) => (
                    <button 
                      key={i} 
                      className="suggestion-chip"
                      onClick={() => handleSuggestionClick(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="ai-input-area">
              <div className="ai-input-row">
                <input
                  type="text"
                  className="ai-input"
                  placeholder="Type your question..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button className="btn-send" onClick={handleSend}>
                  ➤ Send
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// SQL Table Component for rendering SQL results
function SQLTable({ content }) {
  // Try to parse markdown table format
  const lines = content.split('\n').filter(line => line.trim());
  
  // Check if it's a markdown table
  if (lines.some(line => line.includes('|'))) {
    const rows = lines
      .filter(line => !line.includes('---')) // Remove separator line
      .map(line => line.split('|').filter(cell => cell.trim()));
    
    if (rows.length === 0) return <pre>{content}</pre>;
    
    const headers = rows[0];
    const dataRows = rows.slice(1);
    
    return (
      <div className="sql-table-container">
        <table className="sql-results-table">
          <thead>
            <tr>
              {headers.map((header, i) => (
                <th key={i}>{header.trim()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell.trim()}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  
  return <pre className="sql-raw">{content}</pre>;
}

export default AIAssistant;
