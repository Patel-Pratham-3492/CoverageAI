import React, {
  useEffect,
  useState,
} from "react";

import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import ChatInput from "./components/ChatInput";
import PolicyModal from "./components/PolicyModal";

import {
  POLICIES,
  QUICK_QUESTIONS,
} from "./config/policies";

import {
  askPolicyQuestion,
} from "./services/api";

import "./App.css";

export default function App() {
  const [selectedPolicy, setSelectedPolicy] =
    useState(POLICIES[0]);

  const [sidebarOpen, setSidebarOpen] =
    useState(true);

  const [policyModalOpen, setPolicyModalOpen] =
    useState(false);

  const [messages, setMessages] =
    useState([]);

  const [isSearching, setIsSearching] =
    useState(false);

  const [copiedMessageId, setCopiedMessageId] =
    useState(null);

  /*
   * Mobile:
   * sidebar starts closed.
   */
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 900) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };

    handleResize();

    window.addEventListener(
      "resize",
      handleResize
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );
    };
  }, []);

  /*
   * Prevent background scrolling while
   * mobile sidebar/modal is open.
   */
  useEffect(() => {
    const shouldLock =
      window.innerWidth <= 900 &&
      (sidebarOpen || policyModalOpen);

    document.body.style.overflow =
      shouldLock ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [
    sidebarOpen,
    policyModalOpen,
  ]);

  /*
   * Start a completely new conversation.
   */
  const startNewConversation = () => {
    setMessages([]);
    setCopiedMessageId(null);
  };

  /*
   * Change the insurance policy context.
   *
   * A new policy starts with a clean conversation
   * so answers from another policy are not mixed
   * into the current conversation.
   */
  const selectPolicy = (policy) => {
    setSelectedPolicy(policy);

    setMessages([]);
    setCopiedMessageId(null);
  };

  /*
   * Send a policy question to the backend.
   */
  const sendQuestion = async (question) => {
    const cleanQuestion =
      question?.trim();

    if (
      !cleanQuestion ||
      isSearching
    ) {
      return;
    }

    /*
     * Add the user's message immediately
     * so the interface feels responsive.
     */
    const userMessage = {
      id:
        Date.now(),
      sender: "user",
      text: cleanQuestion,
    };

    setMessages((previous) => [
      ...previous,
      userMessage,
    ]);

    setIsSearching(true);

    try {
      /*
       * The API service sends:
       *
       * question
       * selected policy
       */
      const data =
        await askPolicyQuestion({
          question: cleanQuestion,
          policy: selectedPolicy,
        });

      const answer =
        data?.answer ||
        "I could not find an answer in the selected policy.";

      /*
       * Add assistant response.
       */
      const assistantMessage = {
        id:
          Date.now() + 1,

        sender:
          "assistant",

        text:
          answer,

        provider:
          selectedPolicy.name,
      };

      setMessages((previous) => [
        ...previous,
        assistantMessage,
      ]);
    } catch (error) {
      console.error(
        "Policy API error:",
        error
      );

      /*
       * Show a friendly error message
       * without exposing backend details.
       */
      setMessages((previous) => [
        ...previous,
        {
          id:
            Date.now() + 1,

          sender:
            "assistant",

          text:
            "I couldn't process that request right now. Please make sure the backend server is running and try again.",

          provider:
            selectedPolicy.name,
        },
      ]);
    } finally {
      setIsSearching(false);
    }
  };

  /*
   * Copy an assistant response.
   */
  const copyMessage = async (
    messageId,
    text
  ) => {
    try {
      await navigator.clipboard.writeText(
        text
      );

      setCopiedMessageId(messageId);

      window.setTimeout(() => {
        setCopiedMessageId(
          (current) =>
            current === messageId
              ? null
              : current
        );
      }, 1600);
    } catch (error) {
      console.error(
        "Unable to copy:",
        error
      );
    }
  };

  return (
    <div className="app-shell">
      {/* ====================================================
          SIDEBAR
          ==================================================== */}

      <Sidebar
        open={sidebarOpen}
        selectedPolicy={selectedPolicy}
        policies={POLICIES}

        onSelectPolicy={() =>
          setPolicyModalOpen(true)
        }

        onNewConversation={
          startNewConversation
        }

        onClose={() =>
          setSidebarOpen(false)
        }
      />

      {/* ====================================================
          MAIN AREA
          ==================================================== */}

      <main className="main-area">
        {/* ==================================================
            TOPBAR
            ================================================== */}

        <header className="topbar">
          <div className="topbar-left">
            {/* MOBILE MENU */}

            <button
              type="button"
              className="menu-button"
              onClick={() =>
                setSidebarOpen(
                  (current) => !current
                )
              }
              aria-label="Toggle sidebar"
            >
              <i className="bi bi-list" />
            </button>

            {/* BREADCRUMB */}

            <div className="breadcrumb">
              <span>CoverageAI</span>

              <i className="bi bi-chevron-right" />

              <strong>
                Benefits Assistant
              </strong>
            </div>
          </div>

          {/* ==================================================
              TOPBAR RIGHT
              ================================================== */}

          <div className="topbar-right">

            {/* CHANGE PLAN */}

            <button
              type="button"
              className="change-plan-button"
              onClick={() =>
                setPolicyModalOpen(true)
              }
            >
              <i className="bi bi-arrow-left-right" />

              <span>
                Change plan
              </span>
            </button>
          </div>
        </header>

        {/* ==================================================
            CHAT WINDOW
            ================================================== */}

        <ChatWindow
          messages={messages}
          isSearching={isSearching}
          selectedPolicy={selectedPolicy}
          quickQuestions={QUICK_QUESTIONS}
          onQuickQuestion={sendQuestion}
          copiedMessageId={
            copiedMessageId
          }
          onCopy={copyMessage}
        />

        {/* ==================================================
            CHAT INPUT
            ================================================== */}

        <ChatInput
          onSend={sendQuestion}
          disabled={isSearching}
          policyName={
            selectedPolicy.name
          }
        />
      </main>

      {/* ======================================================
          POLICY MODAL
          ====================================================== */}

      <PolicyModal
        open={policyModalOpen}
        policies={POLICIES}
        selectedPolicy={selectedPolicy}
        onSelect={selectPolicy}
        onClose={() =>
          setPolicyModalOpen(false)
        }
      />
    </div>
  );
}
