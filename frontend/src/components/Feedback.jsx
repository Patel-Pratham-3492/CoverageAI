import React, { useState } from "react";
import "./Feedback.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const INITIAL_FORM = {
  name: "",
  email: "",
  feedback: "",
};

const MAX_FEEDBACK_LENGTH = 2000;

export default function Feedback({ onClose }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");

  const isSubmitting = status === "submitting";

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setErrors((prev) => ({
      ...prev,
      [name]: "",
    }));
  }

  function validate() {
    const newErrors = {};

    const name = form.name.trim();
    const email = form.email.trim();
    const feedback = form.feedback.trim();

    if (!name) {
      newErrors.name = "Please enter your name.";
    }

    if (!email) {
      newErrors.email = "Please enter your email.";
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      newErrors.email = "Please enter a valid email.";
    }

    if (!feedback) {
      newErrors.feedback = "Please enter your feedback.";
    } else if (feedback.length < 5) {
      newErrors.feedback =
        "Please provide a little more detail.";
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    setStatus("submitting");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            feedback: form.feedback.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to submit feedback."
        );
      }

      setStatus("success");
      setForm(INITIAL_FORM);
    } catch (error) {
      console.error("Feedback error:", error);
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="feedback-overlay">
        <div
          className="feedback-modal feedback-success-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-success-title"
        >
          <button
            type="button"
            className="feedback-close"
            onClick={onClose}
            aria-label="Close feedback"
          >
            ×
          </button>

          <div
            className="feedback-success-icon"
            aria-hidden="true"
          >
            ✓
          </div>

          <h2 id="feedback-success-title">
            Thank you!
          </h2>

          <p>
            Your feedback has been received successfully.
            We appreciate you taking the time to help us
            improve CoverageAI.
          </p>

          <button
            type="button"
            className="feedback-done-button"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="feedback-overlay"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          onClose
        ) {
          onClose();
        }
      }}
    >
      <div
        className="feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
      >
        <button
          type="button"
          className="feedback-close"
          onClick={onClose}
          aria-label="Close feedback"
        >
          ×
        </button>

        <div className="feedback-header">
          <div
            className="feedback-icon"
            aria-hidden="true"
          >
            💬
          </div>

          <div>
            <h2 id="feedback-title">
              Share your feedback
            </h2>

            <p>
              Help us make CoverageAI better.
            </p>
          </div>
        </div>

        <form
          className="feedback-form"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="feedback-field">
            <label htmlFor="feedback-name">
              Name
            </label>

            <input
              id="feedback-name"
              type="text"
              name="name"
              placeholder="Enter your name"
              value={form.name}
              onChange={handleChange}
              autoComplete="name"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={
                errors.name
                  ? "feedback-name-error"
                  : undefined
              }
            />

            {errors.name && (
              <span
                id="feedback-name-error"
                className="feedback-error"
              >
                {errors.name}
              </span>
            )}
          </div>

          <div className="feedback-field">
            <label htmlFor="feedback-email">
              Email
            </label>

            <input
              id="feedback-email"
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={
                errors.email
                  ? "feedback-email-error"
                  : undefined
              }
            />

            {errors.email && (
              <span
                id="feedback-email-error"
                className="feedback-error"
              >
                {errors.email}
              </span>
            )}
          </div>

          <div className="feedback-field">
            <label htmlFor="feedback-message">
              Feedback
            </label>

            <textarea
              id="feedback-message"
              name="feedback"
              placeholder="Tell us what you think..."
              value={form.feedback}
              onChange={handleChange}
              rows={5}
              maxLength={MAX_FEEDBACK_LENGTH}
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.feedback)}
              aria-describedby={
                errors.feedback
                  ? "feedback-message-error"
                  : "feedback-message-hint"
              }
            />

            <div className="feedback-field-bottom">
              {errors.feedback ? (
                <span
                  id="feedback-message-error"
                  className="feedback-error"
                >
                  {errors.feedback}
                </span>
              ) : (
                <span
                  id="feedback-message-hint"
                  className="feedback-hint"
                >
                  Your feedback helps us improve.
                </span>
              )}

              <span className="feedback-counter">
                {form.feedback.length}/{MAX_FEEDBACK_LENGTH}
              </span>
            </div>
          </div>

          {status === "error" && (
            <div
              className="feedback-submit-error"
              role="alert"
            >
              We couldn't submit your feedback right now.
              Please try again.
            </div>
          )}

          <div className="feedback-actions">
            <button
              type="button"
              className="feedback-cancel-button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="feedback-submit-button"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Sending..."
                : "Send feedback"}
            </button>
          </div>
        </form>

        <div className="feedback-footer">
          We value your feedback and use it to improve
          the experience.
        </div>
      </div>
    </div>
  );
}
