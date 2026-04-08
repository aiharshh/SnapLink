import React, { useState, useRef, useEffect } from 'react';
import './Chatbot.css';
import axiosInstance from '../../utils/axiosInstance';

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'bot', content: 'Hello! I am your AI Time-Travel Assistant. Ask me anything about the history of your saved links.' }
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!inputVal.trim()) return;

    const userMsg = inputVal.trim();
    setInputVal('');
    
    // Add user message
    const newMessages = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // We pass the full history EXCEPT the very first greeting if we want
      // But passing all user/bot messages helps the AI remember context.
      const historyToPass = newMessages.filter(m => m.role !== 'bot' || m.content !== messages[0].content);
      
      const response = await axiosInstance.post('/v1/chat/ask', {
        message: userMsg,
        conversationHistory: historyToPass
      });

      setMessages(prev => [...prev, { role: 'bot', content: response.data.reply }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'bot', content: "I'm sorry, I encountered an error checking your timeline. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  // Safe basic markdown rendering for the bot's response without extra dependencies
  const renderMessageContent = (content) => {
    if (!content) return null;
    
    // Simple bold text replacement logic
    const parts = content.split(/(\*\*.*?\*\*)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      
      // Handle simple links or lists using split by newline
      return (
        <span key={index}>
          {part.split('\n').map((line, i) => (
            <React.Fragment key={i}>
              {line}
              {i !== part.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}
        </span>
      );
    });
  };

  return (
    <div className="chatbot-container">
      {/* Floating Window */}
      <div className={`chatbot-window ${isOpen ? '' : 'hidden'}`}>
        <div className="chatbot-header">
          <h3>
            <div className="online-dot"></div>
            Time-Travel Assistant
          </h3>
          <button className="close-btn" onClick={() => setIsOpen(false)}>&times;</button>
        </div>
        
        <div className="chatbot-messages">
          {messages.map((msg, index) => (
            <div key={index} className={`message ${msg.role}`}>
              {msg.role === 'bot' ? renderMessageContent(msg.content) : msg.content}
            </div>
          ))}
          {isLoading && (
            <div className="message bot typing-indicator">
              <span></span><span></span><span></span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chatbot-input">
          <input 
            type="text" 
            placeholder="Ask about your links history..." 
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button className="send-btn" onClick={handleSend} disabled={isLoading}>
             <svg viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
             </svg>
          </button>
        </div>
      </div>

      {/* Toggle Button */}
      {!isOpen && (
        <button className="chatbot-toggle-btn" onClick={() => setIsOpen(true)}>
          <svg className="bot-icon" viewBox="0 0 24 24">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5v-1H1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2zM7 11a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-5a3 3 0 0 0-3-3H7zm5 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm8 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
          </svg>
        </button>
      )}
    </div>
  );
}
