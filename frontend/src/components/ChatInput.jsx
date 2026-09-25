import React, { useState } from "react";
import "./ChatInput.css";

export default function ChatInput({
  onSend,
  disabled = false,
  policyName,
}) {
  const [value, setValue] = useState("");

  const submit = () => {
    const cleanValue = value.trim();

    if (!cleanValue || disabled) {
      return;
    }

    onSend(cleanValue);
    setValue("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    submit();
  };

  const placeholder = policyName
    ? `Ask about ${policyName}...`
    : "Ask about your insurance plan...";

  return (
    <div className="input-area">
      <div className="input-container">
        <form
          className="chat-form"
          onSubmit={handleSubmit}
        >
          <div className="input-sparkle" aria-hidden="true">
            <i className="bi bi-stars" />
          </div>

          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            aria-label="Ask a question"
          />

          <button
            type="submit"
            className="send-button"
            disabled={disabled || !value.trim()}
            aria-label="Send message"
          >
            <i className="bi bi-arrow-up" aria-hidden="true" />
          </button>
        </form>

        <div className="input-footer">
          <span>
            <i className="bi bi-shield-check" aria-hidden="true" />
            Answers are grounded in policy documents
          </span>

          <span>Press Enter to send</span>
        </div>
      </div>
    </div>
  );
}
