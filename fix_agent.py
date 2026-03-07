with open("frontend/src/pages/AgentRoom.jsx", "r") as f:
    content = f.read()

# Replace CallRoom with AgentRoom
content = content.replace("const CallRoom", "const AgentRoom")
content = content.replace("export default CallRoom", "export default AgentRoom")

# Make the agent automatically "joined" 
content = content.replace(
    "const {\n    isConnected,",
    "const {\n    partnerJoined,\n    isConnected,"
)

# Use isAgent=true in useWebSocket
content = content.replace(
    "disconnect\n  } = useWebSocket(roomId, userId, userName, userLanguageCode, profileId, addTranscript);",
    "disconnect\n  } = useWebSocket(roomId, userId, userName, userLanguageCode, profileId, addTranscript, true);"
)

# Replace textual references
content = content.replace("Vox Translation Room", "Vox AI Companion")
content = content.replace("{partnerName || 'Waiting for partner...'}", "Vox Agent")
content = content.replace("partnerLanguage || 'Detecting...'", "'en-US'")
content = content.replace("{partnerLanguage ? languages.find(l => l.code === partnerLanguage)?.flag : '...'}", "'🤖'")
content = content.replace("Partner speaking...", "Vox is thinking/speaking...")

with open("frontend/src/pages/AgentRoom.jsx", "w") as f:
    f.write(content)
