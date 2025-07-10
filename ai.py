import sys

# --- ADD THESE TWO LINES ---
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
# ---------------------------

from Backend.Chatbot import ChatBot

query = sys.argv[1]
sender = sys.argv[2]

try:
    response = ChatBot(query, sender).strip()
except Exception as e:
    response = f"❌ Python Error: {e}"

print(response)