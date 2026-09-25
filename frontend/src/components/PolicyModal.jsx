import React from "react";
import "./PolicyModal.css";

export default function PolicyModal({
  open,
  policies = [],
  selectedPolicy,
  onSelect,
  onClose,
}) {
  if (!open) {
    return null;
  }

  const handleSelect = (policy) => {
    onSelect(policy);
    onClose();
  };

  return (
    <div
      className="policy-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="policy-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="policy-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="policy-modal-header">
          <div>
            <div className="policy-eyebrow">
              INSURANCE PLAN
            </div>

            <h2 id="policy-modal-title">
              Select your plan
            </h2>

            <p>
              Choose the insurance plan CoverageAI
              should use for your questions.
            </p>
          </div>

          <button
            type="button"
            className="policy-close"
            onClick={onClose}
            aria-label="Close policy selection"
          >
            <i
              className="bi bi-x-lg"
              aria-hidden="true"
            />
          </button>
        </div>

        <div className="policy-list">
          {policies.length === 0 ? (
            <div className="policy-empty">
              No insurance policies available.
            </div>
          ) : (
            policies.map((policy) => {
              const isSelected =
                selectedPolicy?.id === policy.id;

              return (
                <button
                  key={policy.id}
                  type="button"
                  className={`policy-option ${
                    isSelected ? "selected" : ""
                  }`}
                  onClick={() => handleSelect(policy)}
                  aria-pressed={isSelected}
                >
                  <div
                    className="policy-option-icon"
                    style={{
                      color: policy.color,
                      background: `${policy.color}12`,
                    }}
                  >
                    <i
                      className={`bi ${policy.icon}`}
                      aria-hidden="true"
                    />
                  </div>

                  <div className="policy-option-info">
                    <strong>{policy.name}</strong>

                    <span>{policy.tag}</span>
                  </div>

                  <div className="policy-check">
                    {isSelected && (
                      <i
                        className="bi bi-check-lg"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="policy-modal-footer">
          <i
            className="bi bi-shield-check"
            aria-hidden="true"
          />

          <span>
            Answers are grounded in the selected
            policy documents.
          </span>
        </div>
      </div>
    </div>
  );
}
