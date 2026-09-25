const BASE_URL =
  `${import.meta.env.VITE_API_BASE_URL}/api/chat`;

export async function askPolicyQuestion({
  question,
  policy,
}) {
  if (!question?.trim()) {
    throw new Error("Please enter a question.");
  }

  if (!policy) {
    throw new Error("No policy has been selected.");
  }

  const response = await fetch(BASE_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      question: question.trim(),

      // The backend can use this to identify
      // the selected provider/demo policy.
      provider_id: policy.id,

      // The backend can use this to locate
      // the correct policy document.
      policy_name: policy.policy_name,
    }),
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The server returned an invalid response."
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        "Unable to process your request."
    );
  }

  return data;
}
