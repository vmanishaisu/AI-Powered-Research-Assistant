import React, { useState } from "react";


export function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
      setUploadedFile(file);
      setUploadMessage(`✅ Uploaded successfully: ${file.name}`);
    } else {
      setUploadMessage("❌ Please upload a PDF file only.");
      setUploadedFile(null);
    }
  };


  const handleSend = async () => {
    if (!input.trim()) return;
    const newMessage = { role: "user", content: input };
    setMessages([...messages, newMessage]);

    // This is a placeholder for the backend's response to the user's message
    const response = { role: "assistant", content: "Processing your query..." };
    setMessages((prev) => [...prev, response]);
    setInput("");
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>Upload Papers</h2>
        <input type="file" accept="application/pdf" />
      </aside>

      <main className="chat-area">
        <header className="chat-header">InsightGPT</header>
        <div className="chat-window">
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              <strong>{msg.role}:</strong> {msg.content}
            </div>
          ))}
        </div>
        <div className="input-area">
          <label className="file-upload">
            📎
            <input
              type="file"
              onChange={(e) => console.log("File selected:", e.target.files[0])}
              hidden />
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="text-input"
            onKeyDown={(e) => e.key === "Enter" && handleSend()} />
          <button onClick={handleSend} className="send-button">Send</button>
        </div>

      </main>
    </div>
  );
}
