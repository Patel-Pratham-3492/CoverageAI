import React, { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import "./ChatWindow.css";

export default function ChatWindow({
  messages,
  isSearching,
  selectedPolicy,
  quickQuestions,
  onQuickQuestion,
  copiedMessageId,
  onCopy,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
  const container = containerRef.current;

  if (!container) {
    return;
  }

  const timeout = setTimeout(() => {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, 1000);

  return () => {
    clearTimeout(timeout);
  };
}, [messages, isSearching]);


  return (
    <div
      className="conversation-area"
      ref={containerRef}
    >
      <div className="conversation-inner">
        {messages.length === 0 ? (
          <Welcome
            selectedPolicy={selectedPolicy}
            quickQuestions={quickQuestions}
            onQuickQuestion={onQuickQuestion}
            disabled={isSearching}
          />
        ) : (
          <>
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                copiedMessageId={copiedMessageId}
                onCopy={onCopy}
              />
            ))}

            {isSearching && (
              <Thinking
                policyName={selectedPolicy.name}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Welcome({
  selectedPolicy,
  quickQuestions,
  onQuickQuestion,
  disabled,
}) {
  return (
    <div className="welcome">
      <div className="welcome-badge">
        <span
          className="welcome-pulse"
          aria-hidden="true"
        />
        Your plan is ready
      </div>

      <div className="welcome-icon" aria-hidden="true">
        <div>
          <i className="bi bi-stars" />
        </div>
      </div>

      <h1>
        Understand your
        <br />
        <span>health benefits.</span>
      </h1>

      <p className="welcome-description">
        Ask questions about your insurance plan
        and get clear, straightforward answers
        grounded in your policy documents.
      </p>

      <div className="active-plan">
        <div
          className="active-plan-icon"
          style={{
            color: selectedPolicy.color,
            background: `${selectedPolicy.color}12`,
          }}
          aria-hidden="true"
        >
          <i className={`bi ${selectedPolicy.icon}`} />
        </div>

        <div className="active-plan-info">
          <span>Currently viewing</span>

          <strong>{selectedPolicy.name}</strong>
        </div>

        <i
          className="bi bi-check-circle-fill active-check"
          aria-hidden="true"
        />
      </div>

      <div className="welcome-quick">
        <div className="welcome-quick-title">
          START WITH A QUESTION
        </div>

        <div className="welcome-quick-grid">
          {quickQuestions.map((item, index) => (
            <button
              key={`${item.title}-${index}`}
              type="button"
              disabled={disabled}
              className="welcome-question"
              onClick={() => onQuickQuestion(item.question)}
            >
              <div
                className="welcome-question-icon"
                aria-hidden="true"
              >
                <i className={`bi ${item.icon}`} />
              </div>

              <div className="welcome-question-content">
                <strong>{item.title}</strong>

                <span>{item.question}</span>
              </div>

              <i
                className="bi bi-arrow-up-right"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Message({
  message,
  copiedMessageId,
  onCopy,
}) {
  if (message.sender === "user") {
    return (
      <div className="message-row user-row">
        <div className="user-message">
          {message.text}
        </div>
      </div>
    );
  }

  const isCopied = copiedMessageId === message.id;

  return (
    <div className="message-row assistant-row">
      <div className="assistant-message">
        <div className="assistant-header">
          <div
            className="assistant-avatar"
            aria-hidden="true"
          >
            <i className="bi bi-stars" />
          </div>

          <div className="assistant-title">
            <strong>CoverageAI</strong>
            <span>Policy assistant</span>
          </div>

          {message.provider && (
            <div className="response-plan">
              {message.provider}
            </div>
          )}
        </div>

        <div className="assistant-content">
          <ReactMarkdown>
            {message.text}
          </ReactMarkdown>
        </div>

        <div className="assistant-actions">
          <button
            type="button"
            className={`copy-button ${isCopied ? "copied" : ""}`}
            onClick={() => onCopy(message.id, message.text)}
            aria-label={isCopied ? "Message copied" : "Copy message"}
          >
            <i
              className={`bi ${
                isCopied ? "bi-check2" : "bi-copy"
              }`}
              aria-hidden="true"
            />

            <span>{isCopied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Thinking({ policyName }) {
  return (
    <div className="thinking-row">
      <div
        className="thinking-avatar"
        aria-hidden="true"
      >
        <i className="bi bi-stars" />
      </div>

      <div className="thinking-content">
        <strong>Looking through your plan</strong>

        <span>Searching {policyName}</span>

        <div
          className="thinking-dots"
          aria-hidden="true"
        >
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
