import React, { useState, useEffect, useCallback } from "react";
import "./App.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperclip, faGear, faFolder, faPlus, faEdit, faTrash as faTrashAlt, faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";

function App() {
  const [chats, setChats] = useState([]);
  const [activeChatIndex, setActiveChatIndex] = useState(null);
  const [input, setInput] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [menuOpenIndex, setMenuOpenIndex] = useState(null);
  const [error, setError] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameTargetId, setRenameTargetId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [pdfsByChat, setPdfsByChat] = useState({});
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [selectedChats, setSelectedChats] = useState([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [fileMenuOpenId, setFileMenuOpenId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState("");
  const [followups, setFollowups] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderModalType, setFolderModalType] = useState("create"); // "create" or "rename"
  const [folderModalValue, setFolderModalValue] = useState("");
  const [folderModalTargetId, setFolderModalTargetId] = useState(null);
  const [folderCollapse, setFolderCollapse] = useState({});
  // 1. Add a new state for allChats:
  const [allChats, setAllChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [pendingActivateChatId, setPendingActivateChatId] = useState(null);
  // Add state for folder delete modal
  const [showDeleteFolderModal, setShowDeleteFolderModal] = useState(false);
  const [deleteFolderTargetId, setDeleteFolderTargetId] = useState(null);

  const activeChat = activeChatIndex !== null ? chats[activeChatIndex] : null;

  // Close the chat menu when user clicks outside of it
  const menuRef = React.useRef();
  useEffect(() => {
    if (menuOpenIndex === null) return;
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpenIndex(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpenIndex]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // Fetch folders and chats
  useEffect(() => {
    fetchFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchFolders = async () => {
    try {
      const res = await fetch("http://localhost:5000/folders");
      if (!res.ok) throw new Error("Failed to load folders");
      const data = await res.json();
      setFolders(data);
      // Optionally select the first folder by default
      if (data.length > 0 && selectedFolderId === null) setSelectedFolderId(data[0].id);
    } catch (err) {
      setError("Failed to load folders");
    }
    fetchChats(); // Also fetch all chats for uncategorized
  };

  const fetchChats = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("http://localhost:5000/chats");
      if (!res.ok) throw new Error("Failed to load chats");
      const data = await res.json();
      setAllChats(data);
      // If a folder is selected, filter chats for that folder; otherwise, show all uncategorized chats
      if (selectedFolderId) {
        setChats(data.filter(chat => chat.folder_id === selectedFolderId));
      } else {
        setChats(data.filter(chat => !chat.folder_id));
      }
      // Download the list of PDFs for every chat and store them in state
      const pdfsMap = {};
      await Promise.all(
        data.map(async (chat) => {
          const resPdfs = await fetch(`http://localhost:5000/chats/${chat.id}/pdfs`);
          if (resPdfs.ok) {
            const pdfs = await resPdfs.json();
            pdfsMap[chat.id] = pdfs;
          } else {
            pdfsMap[chat.id] = [];
          }
        })
      );
      setPdfsByChat(pdfsMap);
    } catch (err) {
      setError("Failed to load chats");
    } finally {
      
    }
  }, [selectedFolderId]);

  useEffect(() => {
    
    // Check against allChats to ensure the chat exists, regardless of current folder filter
    if (pendingActivateChatId && allChats.some(c => c.id === pendingActivateChatId)) {
      setActiveChatId(pendingActivateChatId);
      setPendingActivateChatId(null);
    }
    // Whenever chats or activeChatId changes, update activeChatIndex
    if (activeChatId) {
      const idx = chats.findIndex(c => c.id === activeChatId);
      setActiveChatIndex(idx !== -1 ? idx : null);
    } else {
      setActiveChatIndex(null);
    }
  }, [chats, activeChatId, pendingActivateChatId, allChats]);

  useEffect(() => {
    if (!activeChat || !Array.isArray(activeChat.messages) || activeChat.messages.length === 0) {
      setFollowups([]);
    }
  }, [activeChat]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  const handleSend = async (customInput) => {
    const question = customInput !== undefined ? customInput : input;
    if (!question.trim()) return;
    setUploadMessage("");
    const userMessage = { role: "user", content: question };
    const assistantReply = { role: "assistant", content: "Processing your query..." };
    const updatedChats = [...chats];

    if (activeChatIndex === null) {
      try {
        const res = await fetch("http://localhost:5000/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Untitled" }),
        });
        if (!res.ok) throw new Error("Failed to create chat");
        const newChat = await res.json();
        newChat.messages = [userMessage, assistantReply];
        setChats((prev) => {
          const newChats = [...prev, newChat];
          setActiveChatIndex(newChats.length - 1);
          return newChats;
        });
        await saveMessages(newChat.id, newChat.messages);
        // After creating a new chat, send the user's question to OpenAI
        fetchOpenAIAnswer(question, newChat.id, 1);
      } catch (err) {
        setError("Failed to create chat or send message");
      }
    } else {
      if (!updatedChats[activeChatIndex].messages) {
        updatedChats[activeChatIndex].messages = [];
      }
      updatedChats[activeChatIndex].messages.push(userMessage, assistantReply);
      setChats(updatedChats);
      try {
        await saveMessages(updatedChats[activeChatIndex].id, updatedChats[activeChatIndex].messages);
        // After saving a new message, send the user's question to OpenAI
        fetchOpenAIAnswer(question, updatedChats[activeChatIndex].id, updatedChats[activeChatIndex].messages.length - 1);
      } catch (err) {
        setError("Failed to save messages");
      }
    }

    setInput("");
  };

  // Get an answer from OpenAI and update the assistant's reply in the chat
  const fetchOpenAIAnswer = async (question, chatId, assistantMsgIndex) => {
    try {
      const res = await fetch("http://localhost:5000/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, chatId }),
      });
      if (!res.ok) throw new Error("Failed to get answer from OpenAI");
      const data = await res.json();
      setChats((prevChats) => {
        const chatsCopy = [...prevChats];
        const chatIdx = chatsCopy.findIndex((c) => c.id === chatId);
        if (chatIdx !== -1 && Array.isArray(chatsCopy[chatIdx].messages)) {
          chatsCopy[chatIdx].messages[assistantMsgIndex] = { role: "assistant", content: data.answer };
        }
        return chatsCopy;
      });
      setFollowups(data.followups || []);
      // Save the updated messages to the backend after getting a response
      setTimeout(() => {
        setChats((prevChats) => {
          const chat = prevChats.find((c) => c.id === chatId);
          if (chat) saveMessages(chatId, chat.messages);
          return prevChats;
        });
      }, 0);
    } catch (err) {
      setChats((prevChats) => {
        const chatsCopy = [...prevChats];
        const chatIdx = chatsCopy.findIndex((c) => c.id === chatId);
        if (chatIdx !== -1 && Array.isArray(chatsCopy[chatIdx].messages)) {
          chatsCopy[chatIdx].messages[assistantMsgIndex] = { role: "assistant", content: "Failed to get answer from OpenAI." };
        }
        return chatsCopy;
      });
      setFollowups([]);
    }
  };

  const saveMessages = async (chatId, messages) => {
    try {
      const res = await fetch(`http://localhost:5000/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      if (!res.ok) throw new Error("Failed to save messages");
    } catch (err) {
      setError("Failed to save messages");
    }
  };

  // --- CHAT CRUD ---
  const handleNewChat = async () => {
    try {
      const res = await fetch("http://localhost:5000/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled" }),
      });
      if (!res.ok) throw new Error("Failed to create chat");
      await fetchChats();
      setInput("");
      setFollowups([]);
    } catch (err) {
      setError("Failed to create new chat");
    }
  };

  const handleDeleteChat = async () => {
    if (!deleteTargetId) return;
    try {
      const res = await fetch(`http://localhost:5000/chats/${deleteTargetId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete chat");
      await fetchChats();
      setActiveChatIndex(null);
      setMenuOpenIndex(null);
      setShowDeleteModal(false);
    } catch (err) {
      setError("Failed to delete chat");
    }
  };

  const handleRenameChat = async () => {
    if (!renameTargetId || !renameValue.trim()) {
      return;
    }
    const chat = allChats.find(c => c.id === renameTargetId);
    if (!chat) {
      setError("Chat not found");
      return;
    }
    try {
      const res = await fetch(`http://localhost:5000/chats/${chat.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      if (!res.ok) throw new Error("Failed to rename chat");
      await fetchChats();
      setShowRenameModal(false);
      setMenuOpenIndex(null);
    } catch (err) {
      setError("Failed to rename chat");
    }
  };

  // Start editing a user message and update the assistant's reply after editing
  const handleEditMessage = async (messageIndex) => {
    if (!activeChat?.messages?.[messageIndex]) return;
    
    const updatedChats = [...chats];
    const chat = updatedChats[activeChatIndex];
    
    // Update the user's message
    chat.messages[messageIndex].content = editValue;
    
    // Get a new answer from OpenAI for the edited message
    try {
      await saveMessages(chat.id, chat.messages);
      // Send the edited question to OpenAI
      await fetchOpenAIAnswer(editValue, chat.id, messageIndex + 1);
    } catch (err) {
      setError("Failed to update message");
    }

    setEditingMessageIndex(null);
    setEditValue("");
  };

  // Handle toggling the selection checkbox for a chat
  const handleChatCheckbox = (chatId) => {
    setSelectedChats((prev) =>
      prev.includes(chatId)
        ? prev.filter((id) => id !== chatId)
        : [...prev, chatId]
    );
  };

  // Show the bulk delete confirmation modal
  const handleBulkDelete = async () => {
    setShowBulkDeleteModal(true);
  };

  const confirmBulkDelete = async () => {
    for (const chatId of selectedChats) {
      await fetch(`http://localhost:5000/chats/${chatId}`, { method: 'DELETE' });
    }
    await fetchChats();
    setSelectedChats([]);
    setActiveChatIndex(null);
    setMenuOpenIndex(null);
    setShowBulkDeleteModal(false);
  };

  // Delete a file from a chat and update the sidebar
  const handleDeleteFile = async (fileId, chatId) => {
    await fetch(`http://localhost:5000/files/${fileId}`, { method: 'DELETE' });
    // Refresh the sidebar's PDF list after deleting a file
    const resPdfs = await fetch(`http://localhost:5000/chats/${chatId}/pdfs`);
    if (resPdfs.ok) {
      const pdfs = await resPdfs.json();
      setPdfsByChat(prev => ({ ...prev, [chatId]: pdfs }));
      // Do NOT delete the chat if there are no files left
    }
    setFileMenuOpenId && setFileMenuOpenId(null);
  };

  // Close the file menu if the user clicks outside of it
  const fileMenuRef = React.useRef();
  useEffect(() => {
    if (fileMenuOpenId === null) return;
    function handleClickOutside(event) {
      if (fileMenuRef.current && !fileMenuRef.current.contains(event.target)) {
        setFileMenuOpenId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [fileMenuOpenId]);

  // --- FOLDER CRUD ---
  const handleCreateFolder = async () => {
    try {
      const res = await fetch("http://localhost:5000/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderModalValue }),
      });
      if (!res.ok) throw new Error("Failed to create folder");
      setShowFolderModal(false);
      setFolderModalValue("");
      await fetchFolders();
    } catch (err) {
      setError("Failed to create folder");
    }
  };

  const handleRenameFolder = async () => {
    try {
      const res = await fetch(`http://localhost:5000/folders/${folderModalTargetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderModalValue }),
      });
      if (!res.ok) throw new Error("Failed to rename folder");
      setShowFolderModal(false);
      setFolderModalValue("");
      setFolderModalTargetId(null);
      await fetchFolders();
    } catch (err) {
      setError("Failed to rename folder");
    }
  };

  const handleDeleteFolder = async (folderId) => {
    try {
      const res = await fetch(`http://localhost:5000/folders/${folderId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete folder");
      if (selectedFolderId === folderId) setSelectedFolderId(null);
      setActiveChatIndex(null);
      await fetchFolders();
    } catch (err) {
      setError("Failed to delete folder");
    }
  };

  const handleSendFollowup = async (q) => {
    setInput(q);
    await handleSend(q);
  };

  // Helper to get chat IDs for a folder or uncategorized
  const chatIdsInFolder = (folderId) => chats.filter(chat => chat.folder_id === folderId).map(chat => chat.id);
  // Update uncategorizedChatIds to always use allChats
  const uncategorizedChatIds = allChats.filter(chat => !chat.folder_id).map(chat => chat.id);

  // Restore file upload handler
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeChat) {
      setUploadMessage(file ? "❌ Please select a chat first." : "");
      return;
    }

    setUploadMessage("Uploading...");
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Upload the file
      const res = await fetch(`http://localhost:5000/upload/${activeChat.id}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const uploadedFile = await res.json();
      setUploadMessage("");

      // Add a file message to the chat
      const fileMessage = {
        role: 'file',
        content: {
          name: uploadedFile.filename,
          type: file.type,
        }
      };

      // Update chat messages in allChats
      const updatedChats = allChats.map(chat =>
        chat.id === activeChat.id
          ? { ...chat, messages: [...(chat.messages || []), fileMessage] }
          : chat
      );
      setAllChats(updatedChats);

      // Save messages to backend
      await saveMessages(activeChat.id, updatedChats.find(c => c.id === activeChat.id).messages);

      // Refresh sidebar PDF list
      const resPdfs = await fetch(`http://localhost:5000/chats/${activeChat.id}/pdfs`);
      if (resPdfs.ok) {
        const pdfs = await resPdfs.json();
        setPdfsByChat(prev => ({ ...prev, [activeChat.id]: pdfs }));
      }
      // Always fetch chats after file upload to sync state
      await fetchChats();
    } catch (err) {
      setUploadMessage("❌ Upload failed. Please try again.");
    } finally {
      e.target.value = null;
    }
  };

  useEffect(() => {
    // Remove any selected chat IDs that are no longer present in allChats
    setSelectedChats(prev => prev.filter(id => allChats.some(chat => chat.id === id)));
  }, [allChats]);

  // Add this useEffect to fetch chats whenever selectedFolderId changes:
  useEffect(() => {
    fetchChats();
  }, [selectedFolderId, fetchChats]);

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>InsightGPT</h2>
        <button onClick={handleNewChat} className="new-chat-button">
          + New Chat
        </button>
        {/* Folders section */}
        <div style={{ margin: '20px 0 8px 0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Folders</span>
          <button onClick={() => { setShowFolderModal(true); setFolderModalType('create'); setFolderModalValue(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }} title="Add Folder">
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </div>
        {/* Inline create folder input under Folders section */}
        {showFolderModal && folderModalType === 'create' && (
          <div style={{ margin: '0 0 1rem 0', padding: '1rem', background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px 0 rgba(30,41,59,0.08)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: '1.08em', marginBottom: 4 }}>Create Folder</span>
            <input
              type="text"
              value={folderModalValue}
              onChange={e => setFolderModalValue(e.target.value)}
              style={{ width: '100%', marginBottom: 8, padding: 8, borderRadius: 6, border: '1px solid #e5e7eb', fontSize: '1em' }}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowFolderModal(false)} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', color: '#374151', fontWeight: 500 }}>Cancel</button>
              <button
                onClick={handleCreateFolder}
                style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '6px 18px', borderRadius: 6, fontWeight: 600 }}
              >
                Create
              </button>
            </div>
          </div>
        )}
        {/* Sidebar: Folders/Projects and their chats */}
        <div className="folder-list">
          {folders.map(folder => {
            const folderChatIds = chatIdsInFolder(folder.id);
            const allSelected = folderChatIds.length > 0 && folderChatIds.every(id => selectedChats.includes(id));
            return (
              <div key={folder.id} className="folder-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => setFolderCollapse(f => ({ ...f, [folder.id]: !f[folder.id] }))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <FontAwesomeIcon icon={folderCollapse[folder.id] ? faChevronRight : faChevronDown} />
                  </button>
                  <span
                    className={selectedFolderId === folder.id ? 'chat-title active' : 'chat-title'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedFolderId(folder.id);
                      setActiveChatIndex(null); // Reset selection when switching folders
                      setFollowups([]);
                      fetchChats(); // Ensure chat list is always up-to-date after folder switch
                    }}
                  >
                    <FontAwesomeIcon icon={faFolder} style={{ marginRight: 4 }} />
                    {folder.name}
                  </span>
                  {/* Add chat to folder */}
                  <button onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const res = await fetch("http://localhost:5000/chats", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ title: "Untitled", folder_id: folder.id }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error("Failed to create chat: " + (data?.error || res.status));
                      await fetchChats(); // Always fetch all chats so uncategorized chats are visible
                      setSelectedFolderId(folder.id);
                      setFolderCollapse(f => ({ ...f, [folder.id]: false })); // Ensure folder is expanded after adding chat
                      setInput("");
                      setFollowups([]);
                    } catch (err) {
                      setError("Failed to create new chat: " + (err.message || err));
                    }
                  }} style={{ background: 'none', border: 'none', cursor: 'pointer' }} title="Add Chat to Folder">
                    <FontAwesomeIcon icon={faPlus} />
                  </button>
                  <button onClick={() => { setShowFolderModal(true); setFolderModalType('rename'); setFolderModalValue(folder.name); setFolderModalTargetId(folder.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }} title="Rename Folder">
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button onClick={() => { setShowDeleteFolderModal(true); setDeleteFolderTargetId(folder.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }} title="Delete Folder">
                    <FontAwesomeIcon icon={faTrashAlt} />
                  </button>
                </div>
                {/* Always show all chats for this folder when expanded */}
                {!folderCollapse[folder.id] && (
                  <div className="chat-list" style={{ marginLeft: 24 }}>
                    {/* Always show Select All for this folder if there are chats in the folder */}
                    {folderChatIds.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedChats(prev => Array.from(new Set([...prev, ...folderChatIds])));
                            } else {
                              setSelectedChats(prev => prev.filter(id => !folderChatIds.includes(id)));
                            }
                          }}
                          style={{ marginRight: 8 }}
                        />
                        <span style={{ fontSize: '0.95em' }}>Select All</span>
                        {selectedChats.some(id => folderChatIds.includes(id)) && (
                          <button
                            onClick={handleBulkDelete}
                            className="delete-selected-button"
                            style={{ marginLeft: 12, padding: '2px 10px', fontSize: '0.9em', height: 28 }}
                          >
                            Delete Selected
                          </button>
                        )}
                      </div>
                    )}
                    {allChats.filter(chat => chat.folder_id === folder.id).map((chat, index) => (
                      <div
                        key={chat.id || index}
                        className={`chat-history-item ${chat.id === (activeChat && activeChat.id) ? "active" : ""}`}
                        onClick={() => {
                          setSelectedFolderId(folder.id);
                          setPendingActivateChatId(chat.id);
                          setFollowups([]);
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                          <input
                            type="checkbox"
                            className="chat-checkbox"
                            checked={selectedChats.includes(chat.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleChatCheckbox(chat.id);
                            }}
                            style={{ marginRight: '8px' }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                              <span className="chat-title" style={{ fontWeight: 600, fontSize: '1em', marginBottom: 2, flex: 1 }}>
                                {chat.title && chat.title.trim() ? chat.title : 'Untitled'}
                              </span>
                              {/* Rename chat */}
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setShowRenameModal(true);
                                  setRenameValue(chat.title);
                                  setRenameTargetId(chat.id);
                                }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4 }}
                                title="Rename Chat"
                              >
                                <FontAwesomeIcon icon={faEdit} />
                              </button>
                              {/* Delete chat */}
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setShowDeleteModal(true);
                                  setDeleteTargetId(chat.id);
                                }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4 }}
                                title="Delete Chat"
                              >
                                <FontAwesomeIcon icon={faTrashAlt} />
                              </button>
                            </div>
                            {pdfsByChat[chat.id] && pdfsByChat[chat.id].length > 0 && (
                              <ul style={{ listStyle: 'disc', paddingLeft: 18, margin: '4px 0 0 0', fontSize: '0.97em', color: '#222', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                {pdfsByChat[chat.id].map(file => (
                                  <li key={file.id} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2, position: 'relative', width: 'fit-content', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', width: '100%' }}>
                                      <a
                                        href={`http://localhost:5000/files/${file.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="sidebar-file-link"
                                        title={file.originalname || file.filename}
                                        style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}
                                      >
                                        {file.originalname || file.filename}
                                      </a>
                                      <button
                                        onClick={e => {
                                          e.stopPropagation();
                                          handleDeleteFile(file.id, chat.id);
                                        }}
                                        className="file-trash-btn"
                                        title="Delete file"
                                      >
                                        <FontAwesomeIcon icon={faTrashAlt} />
                                      </button>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Sidebar: Uncategorized chats */}
        <div style={{ margin: '20px 0 8px 0', fontWeight: 600 }}>Chats</div>
        <div className="chat-list">
          {/* Always show Select All for uncategorized if there are any chats */}
          {uncategorizedChatIds.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={uncategorizedChatIds.length > 0 && uncategorizedChatIds.every(id => selectedChats.includes(id))}
                onChange={e => {
                  if (e.target.checked) {
                    setSelectedChats(prev => Array.from(new Set([...prev, ...uncategorizedChatIds])));
                  } else {
                    setSelectedChats(prev => prev.filter(id => !uncategorizedChatIds.includes(id)));
                  }
                }}
                style={{ marginRight: 8 }}
              />
              <span style={{ fontSize: '0.95em' }}>Select All</span>
              {selectedChats.some(id => uncategorizedChatIds.includes(id)) && (
                <button
                  onClick={handleBulkDelete}
                  className="delete-selected-button"
                  style={{ marginLeft: 12, padding: '2px 10px', fontSize: '0.9em', height: 28 }}
                >
                  Delete Selected
                </button>
              )}
            </div>
          )}
          {allChats.filter(chat => !chat.folder_id).map((chat, index) => (
            <div
              key={chat.id || index}
              className={`chat-history-item ${chat.id === (activeChat && activeChat.id) ? "active" : ""}`}
              onClick={() => {
                setSelectedFolderId(null);
                setPendingActivateChatId(chat.id);
                setFollowups([]);
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <input
                  type="checkbox"
                  className="chat-checkbox"
                  checked={selectedChats.includes(chat.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleChatCheckbox(chat.id);
                  }}
                  style={{ marginRight: '8px' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <span className="chat-title" style={{ fontWeight: 600, fontSize: '1em', marginBottom: 2, flex: 1 }}>
                      {chat.title && chat.title.trim() ? chat.title : 'Untitled'}
                    </span>
                    {/* Rename chat */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setShowRenameModal(true);
                        setRenameValue(chat.title);
                        setRenameTargetId(chat.id);
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4 }}
                      title="Rename Chat"
                    >
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    {/* Delete chat */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setShowDeleteModal(true);
                        setDeleteTargetId(chat.id);
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4 }}
                      title="Delete Chat"
                    >
                      <FontAwesomeIcon icon={faTrashAlt} />
                    </button>
                  </div>
                  {pdfsByChat[chat.id] && pdfsByChat[chat.id].length > 0 && (
                    <ul style={{ listStyle: 'disc', paddingLeft: 18, margin: '4px 0 0 0', fontSize: '0.97em', color: '#222', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      {pdfsByChat[chat.id].map(file => (
                        <li key={file.id} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2, position: 'relative', width: 'fit-content', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', width: '100%' }}>
                            <a
                              href={`http://localhost:5000/files/${file.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="sidebar-file-link"
                              title={file.originalname || file.filename}
                              style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}
                            >
                              {file.originalname || file.filename}
                            </a>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                handleDeleteFile(file.id, chat.id);
                              }}
                              className="file-trash-btn"
                              title="Delete file"
                            >
                              <FontAwesomeIcon icon={faTrashAlt} />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Folder modal for create/rename */}
        {showFolderModal && folderModalType === 'rename' && (
          <div className="modal-overlay" style={{ zIndex: 300 }}>
            <div className="modal-content">
              <h3>Rename Folder</h3>
              <input
                type="text"
                value={folderModalValue}
                onChange={e => setFolderModalValue(e.target.value)}
                style={{ width: "100%", marginBottom: 16, padding: 8 }}
                autoFocus
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setShowFolderModal(false)}>Cancel</button>
                <button
                  onClick={handleRenameFolder}
                  style={{ background: "#4f46e5", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 4 }}
                >
                  Rename
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="dark-toggle-container">
          <label className="switch">
            <input type="checkbox" checked={darkMode} onChange={toggleDarkMode} />
            <span className="slider round"></span>
          </label>
          <span className="toggle-label">{darkMode ? "Light Mode" : "Dark Mode"}</span>
          <button className="settings-gear-btn" onClick={() => setShowSettings(true)} title="Settings">
            <FontAwesomeIcon icon={faGear} />
          </button>
        </div>
      </aside>

      <main className="chat-area">
        <header className="chat-header">
          {activeChat ? `InsightGPT - ${activeChat.title}` : "InsightGPT"}
        </header>

        <div className="chat-window">
          {Array.isArray(activeChat?.messages) && activeChat.messages.length > 0 ? (
            activeChat.messages.map((msg, i) => {
              if (msg.role === 'file') {
                return (
                  <div key={i} className="message file">
                    <div className="file-bubble">
                      <FontAwesomeIcon icon={faPaperclip} className="file-icon" />
                      <div className="file-info">
                        <span className="file-name">{msg.content.name}</span>
                        <span className="file-type">File Uploaded</span>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className={`message ${msg.role}`}>
                  <strong>{msg.role === 'assistant' ? 'Assistant' : 'You'}:</strong>{" "}
                  {msg.role === "user" && editingMessageIndex === i ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        style={{ flex: 1, padding: '4px 8px' }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleEditMessage(i);
                          } else if (e.key === 'Escape') {
                            setEditingMessageIndex(null);
                            setEditValue("");
                          }
                        }}
                        autoFocus
                      />
                      <button 
                        onClick={() => handleEditMessage(i)}
                        style={{ padding: '4px 8px' }}
                      >
                        Save
                      </button>
                      <button 
                        onClick={() => {
                          setEditingMessageIndex(null);
                          setEditValue("");
                        }}
                        style={{ padding: '4px 8px' }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span style={{ position: 'relative' }}>
                      {msg.content}
                      {msg.role === "user" && (
                        <button
                          onClick={() => {
                            setEditingMessageIndex(i);
                            setEditValue(msg.content);
                          }}
                          style={{
                            marginLeft: '8px',
                            padding: '2px 6px',
                            fontSize: '1.2em',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            color: 'white',
                            opacity: 0.7
                          }}
                          title="Edit"
                        >
                          &#8942;
                        </button>
                      )}
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div style={{ textAlign: "center", marginTop: "2rem" }}>
              No messages yet.
            </div>
          )}

          {followups.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>AI Follow-up Suggestions:</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {followups.map((q, i) => (
                  <button
                    key={i}
                    style={{
                      background: "#e0e7ff",
                      color: "#1e293b",
                      border: "none",
                      borderRadius: 6,
                      padding: "6px 14px",
                      cursor: "pointer",
                      fontSize: "0.97em"
                    }}
                    onClick={() => handleSendFollowup(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="input-area">
          <label className="file-upload" title="Upload File">
            <FontAwesomeIcon icon={faPaperclip} />
            <input type="file" accept="application/pdf,image/*" onChange={handleFileChange} hidden />
          </label>
          <input
            type="text"
            autoComplete="off"
            name="chat-question-unique-2024"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="text-input"
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button onClick={() => handleSend()} className="send-button">Send</button>
        </div>

        {uploadMessage && (
          <div 
            className="error-message" 
            style={{ 
              padding: "0.5rem 2rem", 
              color: uploadMessage.startsWith("❌") ? "#ef4444" : "#6b7280"
            }}
          >
            {uploadMessage}
          </div>
        )}
        {error && (
          <div className="error-message" style={{ padding: "0.5rem 2rem" }}>
            {error}
          </div>
        )}
      </main>

      
      {showRenameModal && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div
            className="modal-content"
            style={{ background: "#fff", padding: 24, borderRadius: 8, minWidth: 300 }}
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === "Enter") handleRenameChat();
              if (e.key === "Escape") setShowRenameModal(false);
            }}
          >
            <h3>Rename Chat</h3>
            <input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              style={{ width: "100%", marginBottom: 16, padding: 8 }}
              autoFocus
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowRenameModal(false)}>Cancel</button>
              <button onClick={handleRenameChat} style={{ background: "#4f46e5", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 4 }}>Rename</button>
            </div>
          </div>
        </div>
      )}
      
      {showDeleteModal && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div
            className="modal-content"
            style={{ background: "#fff", padding: 24, borderRadius: 8, minWidth: 300 }}
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === "Enter") handleDeleteChat();
              if (e.key === "Escape") setShowDeleteModal(false);
            }}
          >
            <h3>Delete Chat</h3>
            <p>Are you sure you want to delete this chat?</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button onClick={handleDeleteChat} style={{ background: "#d00", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 4 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {showBulkDeleteModal && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div
            className="modal-content"
            style={{ background: "#fff", padding: 24, borderRadius: 8, minWidth: 300 }}
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === "Enter") confirmBulkDelete();
              if (e.key === "Escape") setShowBulkDeleteModal(false);
            }}
          >
            <h3>Bulk Delete Chats</h3>
            <p>Are you sure you want to delete {selectedChats.length} selected chats?</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowBulkDeleteModal(false)}>Cancel</button>
              <button
                onClick={confirmBulkDelete}
                style={{ background: "#ef4444", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 4 }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {showSettings && (
        <div className="modal-overlay" style={{ zIndex: 300 }}>
          <div className="modal-content">
            <h3>OpenAI API Key</h3>
            <input
              type="password"
              autoComplete="off"
              name="openai-api-key-unique-2024"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              placeholder="Enter your OpenAI API key"
              style={{ width: "100%", marginBottom: 16, padding: 8 }}
              autoFocus
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowSettings(false)}>Cancel</button>
              <button
                onClick={async () => {
                  setApiKeyStatus("");
                  try {
                    const res = await fetch("http://localhost:5000/api/set-openai-key", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ apikey: apiKeyInput }),
                    });
                    if (!res.ok) {
                      let msg = "Failed to set API key";
                      try {
                        const err = await res.json();
                        if (err && err.error) msg = err.error;
                      } catch {}
                      throw new Error(msg);
                    }
                    setApiKeyStatus("API key saved!");
                    setShowSettings(false);
                  } catch (e) {
                    setApiKeyStatus(e.message || "Failed to save API key.");
                  }
                }}
                style={{ background: "#2563eb", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 4 }}
              >
                Save
              </button>
            </div>
            {apiKeyStatus && <div style={{ marginTop: 12, color: apiKeyStatus.includes("Failed") ? "#ef4444" : "#22c55e" }}>{apiKeyStatus}</div>}
          </div>
        </div>
      )}
      {showDeleteFolderModal && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div
            className="modal-content"
            style={{ background: "#fff", padding: 24, borderRadius: 8, minWidth: 300 }}
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === "Enter") handleDeleteFolder(deleteFolderTargetId);
              if (e.key === "Escape") setShowDeleteFolderModal(false);
            }}
          >
            <h3>Delete Folder</h3>
            <p>Are you sure you want to delete this folder?</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowDeleteFolderModal(false)}>Cancel</button>
              <button onClick={() => { handleDeleteFolder(deleteFolderTargetId); setShowDeleteFolderModal(false); }} style={{ background: "#d00", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 4 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;