import React, { useState } from "react";
import "./Sidebar.css";
import Feedback from "./Feedback";

export default function Sidebar({
  open,
  selectedPolicy,
  policies,
  onSelectPolicy,
  onNewConversation,
  onClose,
}) {
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <>
      {/* SIDEBAR BACKDROP */}
      <div
        className={`sidebar-backdrop ${
          open ? "visible" : ""
        }`}
        onClick={onClose}
      />

      {/* SIDEBAR */}
      <aside
        className={`sidebar ${
          open ? "sidebar-open" : "sidebar-closed"
        }`}
      >
        {/* ======================================================
            BRAND
            ====================================================== */}

        <div className="sidebar-brand">
          <div className="brand-icon">
            <i className="bi bi-stars" />
          </div>

          <div>
            <div className="brand-name">
              Coverage<span>AI</span>
            </div>

            <div className="brand-caption">
              HEALTH BENEFITS ASSISTANT
            </div>
          </div>

          <button
            className="mobile-sidebar-close"
            onClick={onClose}
            type="button"
            aria-label="Close sidebar"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {/* ======================================================
            NEW CHAT
            ====================================================== */}

        <button
          className="new-chat-btn"
          onClick={() => {
            onNewConversation();
            onClose();
          }}
          type="button"
        >
          <span className="new-chat-icon">
            <i className="bi bi-plus-lg" />
          </span>

          <span>New conversation</span>
        </button>

        {/* ======================================================
            YOUR PLAN
            ====================================================== */}

        <div className="sidebar-section">
          <div className="section-label">
            YOUR PLAN
          </div>

          {selectedPolicy && (
            <button
              className="selected-plan-card"
              type="button"
              onClick={() =>
                onSelectPolicy(selectedPolicy)
              }
            >
              <div
                className="plan-icon"
                style={{
                  color: selectedPolicy.color,
                  background: `${selectedPolicy.color}15`,
                }}
              >
                <i
                  className={`bi ${selectedPolicy.icon}`}
                />
              </div>

              <div className="plan-info">
                <div className="plan-name">
                  {selectedPolicy.name}
                </div>

                <div className="plan-status">
                  <span />
                  {selectedPolicy.tag}
                </div>
              </div>

              <i className="bi bi-chevron-right plan-arrow" />
            </button>
          )}

          {/* ====================================================
              PORTFOLIO SHOWCASE NOTICE
              ==================================================== */}

          <div className="showcase-notice">
            <div className="showcase-notice-icon">
              <i className="bi bi-stars" />
            </div>

            <div className="showcase-notice-content">
              <strong>Portfolio showcase</strong>

              <p>
                CoverageAI is a demonstration project
                built for portfolio purposes. It is not
                affiliated with or approved by any
                university, insurer, or healthcare provider.
              </p>

              <span>
                <i className="bi bi-info-circle" />

                <span>
                  More university & provider options
                  coming soon
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* ======================================================
            HELP / TRUST
            ====================================================== */}

        <div className="sidebar-help">
          <div className="help-card">
            <div className="help-icon">
              <i className="bi bi-shield-lock" />
            </div>

            <div>
              <strong>Policy protected</strong>

              <p>
                Answers are grounded in your
                plan documents.
              </p>
            </div>
          </div>
        </div>

        {/* ======================================================
            FOOTER
            ====================================================== */}

        <div className="sidebar-footer">
          <button
            type="button"
            className="feedback-button"
            onClick={() => setShowFeedback(true)}
          >
            <i className="bi bi-chat-square-heart" />

            <span>Feedback & insights</span>
          </button>
        </div>
      </aside>

      {/* ======================================================
          FEEDBACK MODAL
          ====================================================== */}

      {showFeedback && (
        <Feedback
          selectedPolicy={selectedPolicy}
          onClose={() => setShowFeedback(false)}
        />
      )}
    </>
  );
}
