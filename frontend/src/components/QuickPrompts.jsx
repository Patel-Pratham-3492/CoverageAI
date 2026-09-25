import React from "react";
import "./QuickPrompts.css";

export default function QuickPrompts({
  questions = [],
  onSelect,
  disabled = false,
}) {
  const handleSelect = (question) => {
    if (disabled || !question) {
      return;
    }

    onSelect(question);
  };

  return (
    <section
      className="quick-section"
      aria-labelledby="quick-prompts-title"
    >
      <div
        id="quick-prompts-title"
        className="quick-title"
      >
        START WITH A QUESTION
      </div>

      <div className="quick-grid">
        {questions.map((item, index) => {
          if (!item) {
            return null;
          }

          const key =
            item.id ||
            `${item.title || "question"}-${index}`;

          return (
            <button
              key={key}
              type="button"
              className="quick-card"
              disabled={disabled}
              onClick={() =>
                handleSelect(item.question)
              }
            >
              <div className="quick-icon">
                <i
                  className={`bi ${item.icon || ""}`}
                  aria-hidden="true"
                />
              </div>

              <div className="quick-content">
                <strong>{item.title}</strong>

                <span>{item.question}</span>
              </div>

              <i
                className="bi bi-arrow-up-right quick-arrow"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
