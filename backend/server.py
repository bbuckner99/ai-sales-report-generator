from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from emergentintegrations.llm.chat import LlmChat, UserMessage
import re


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatRequest(BaseModel):
    session_id: str
    message: str

class ChatResponse(BaseModel):
    response: str
    command: Optional[str] = None
    is_complete: bool = False

class CommandRequest(BaseModel):
    start_date: str  # MM/DD/YY
    end_date: str    # mm/dd/yy

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "AI Sales Report Generator API"}

@api_router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Handle chat messages and generate commands when dates are collected"""
    try:
        # Store user message
        user_msg = ChatMessage(
            session_id=request.session_id,
            role="user",
            content=request.message
        )
        user_doc = user_msg.model_dump()
        user_doc['timestamp'] = user_doc['timestamp'].isoformat()
        await db.chat_messages.insert_one(user_doc)
        
        # Get chat history for this session
        history = await db.chat_messages.find(
            {"session_id": request.session_id},
            {"_id": 0}
        ).sort("timestamp", 1).to_list(100)
        
        # Initialize AI chat
        system_message = """You are an AI assistant for a Sales Report Generator. Your job is to:
1. Ask the user for a START DATE and END DATE for their sales report
2. Accept dates in various formats (e.g., "January 15, 2024", "01/15/24", "1/15/2024")
3. Once you have both dates, confirm them with the user
4. Be friendly and conversational

Important: You only need to collect two pieces of information:
- Start date
- End date

Keep your responses brief and focused. When you have both dates, confirm them in MM/DD/YY format."""

        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=request.session_id,
            system_message=system_message
        ).with_model("openai", "gpt-4o-mini")
        
        # Send message to AI
        user_message = UserMessage(text=request.message)
        ai_response = await chat.send_message(user_message)
        
        # Store AI response
        ai_msg = ChatMessage(
            session_id=request.session_id,
            role="assistant",
            content=ai_response
        )
        ai_doc = ai_msg.model_dump()
        ai_doc['timestamp'] = ai_doc['timestamp'].isoformat()
        await db.chat_messages.insert_one(ai_doc)
        
        # Try to extract dates from the conversation
        dates = extract_dates_from_history(history + [user_doc, ai_doc])
        
        command = None
        is_complete = False
        
        if dates and dates.get('start_date') and dates.get('end_date'):
            # Generate command
            command = f"S4DMRPTW /SFV5PTDRNG.FMT /T8 /SB1 /PD33{dates['start_date']}{dates['end_date']}"
            is_complete = True
        
        return ChatResponse(
            response=ai_response,
            command=command,
            is_complete=is_complete
        )
        
    except Exception as e:
        logging.error(f"Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/chat/history/{session_id}")
async def get_chat_history(session_id: str):
    """Get chat history for a session"""
    try:
        messages = await db.chat_messages.find(
            {"session_id": session_id},
            {"_id": 0}
        ).sort("timestamp", 1).to_list(100)
        
        return {"messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/generate-command")
async def generate_command(request: CommandRequest):
    """Generate the S4DMRPTW command with provided dates"""
    try:
        command = f"S4DMRPTW /SFV5PTDRNG.FMT /T8 /SB1 /PD33{request.start_date}{request.end_date}"
        return {"command": command}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def extract_dates_from_history(history: List[dict]) -> Optional[dict]:
    """Extract start and end dates from chat history"""
    # Look for dates in MM/DD/YY format
    date_pattern = r'\b(\d{1,2})/(\d{1,2})/(\d{2,4})\b'
    
    dates_found = []
    for msg in history:
        matches = re.findall(date_pattern, msg['content'])
        for match in matches:
            month, day, year = match
            # Convert to MM/DD/YY format
            if len(year) == 4:
                year = year[2:]
            formatted = f"{month.zfill(2)}/{day.zfill(2)}/{year}"
            dates_found.append(formatted)
    
    if len(dates_found) >= 2:
        return {
            'start_date': dates_found[0],
            'end_date': dates_found[1]
        }
    
    return None

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()