import os

files_to_fix = [
    "frontend/src/pages/VoiceSetup.jsx",
    "frontend/src/pages/CallRoom.jsx",
    "frontend/src/components/LanguageBadge.jsx"
]

for file_path in files_to_fix:
    with open(file_path, "r") as f:
        content = f.read()
        
    # We don't necessarily need to remove them from LanguageBadge since it's just a mapping,
    # but we MUST remove them from the UI dropdown lists in VoiceSetup and CallRoom.
    if "VoiceSetup.jsx" in file_path or "CallRoom.jsx" in file_path:
        content = content.replace("{ name: 'Yoruba',", "// { name: 'Yoruba',")
        content = content.replace("{ name: 'Igbo',", "// { name: 'Igbo',")
        content = content.replace("{ name: 'Hausa',", "// { name: 'Hausa',")
        
    with open(file_path, "w") as f:
        f.write(content)

print("Updated UI files!")
