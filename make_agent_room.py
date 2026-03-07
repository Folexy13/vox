import re

with open('frontend/src/pages/AgentRoom.jsx', 'r') as f:
    content = f.read()

# Replace CallRoom with AgentRoom
content = content.replace('const CallRoom', 'const AgentRoom')
content = content.replace('export default CallRoom', 'export default AgentRoom')

# Fix useWebSocket call to pass isAgent=true
content = content.replace(
    'const {',
    'const {\n    partnerJoined,'
)

content = content.replace(
    'disconnect\n  } = useWebSocket(roomId, userId, userName, userLanguageCode, profileId, addTranscript);',
    'disconnect\n  } = useWebSocket(roomId, userId, userName, userLanguageCode, profileId, addTranscript, true);'
)

# Replace "Vox Translation Room" title with "Vox Agent"
content = content.replace('Vox Translation Room', 'Vox AI Companion')

# Change "Waiting for partner..." logic to just show the AI is connected
content = content.replace('{partnerName || \'Waiting for partner...\'}', 'Vox Agent')
content = content.replace('partnerLanguage || \'Detecting...\'', "'en-US'")
content = content.replace('{partnerLanguage ? languages.find(l => l.code === partnerLanguage)?.flag : \'...\'}', "'🤖'")
content = content.replace('Partner speaking...', 'Vox is thinking/speaking...')

with open('frontend/src/pages/AgentRoom.jsx', 'w') as f:
    f.write(content)
