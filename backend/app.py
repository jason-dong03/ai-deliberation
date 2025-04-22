import eventlet
eventlet.monkey_patch()

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import os
from dotenv import load_dotenv
import json
import random
from datetime import datetime
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline
import torch

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "https://ai-deliberation.netlify.app"}})

# Initialize Socket.IO
socketio = SocketIO(app, 
    cors_allowed_origins="*",
    async_mode='eventlet',
    logger=True,
    engineio_logger=True
)

# Initialize model
try:
    model_name = "facebook/opt-125m"  # Smaller, publicly available model
    print("Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    
    print("Loading model...")
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float16,
        device_map="auto",
        low_cpu_mem_usage=True
    )

    print("Initializing pipeline...")
    # Initialize Hugging Face pipeline
    generator = pipeline(
        'text-generation',
        model=model,
        tokenizer=tokenizer,
        max_length=512,
        temperature=0.7,
        top_p=0.9,
        do_sample=True,
        pad_token_id=tokenizer.eos_token_id
    )
    print("Successfully initialized model")
except Exception as e:
    print(f"Error initializing model: {str(e)}")
    print("Falling back to basic response generation...")
    generator = None

# In-memory storage for debates
debates = {}

# AI Agent personas
AGENTS = [
    {
        "name": "Economist",
        "role": "Economic policy expert",
        "bias": "Focused on economic efficiency and market dynamics"
    },
    {
        "name": "Ethicist",
        "role": "Moral philosophy specialist",
        "bias": "Concerned with ethical implications and human rights"
    },
    {
        "name": "Environmentalist",
        "role": "Environmental policy expert",
        "bias": "Prioritizes ecological sustainability and climate impact"
    },
    {
        "name": "Social Worker",
        "role": "Social policy specialist",
        "bias": "Focused on social welfare and community impact"
    }
]

@app.route('/api/start_debate', methods=['POST'])
def start_debate():
    data = request.json
    topic = data.get('topic')
    
    if not topic:
        return jsonify({"error": "Topic is required"}), 400
    
    # Create a new debate session
    debate_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    debate_data = {
        "topic": topic,
        "start_time": datetime.now().isoformat(),
        "status": "active",
        "messages": []
    }
    
    debates[debate_id] = debate_data
    
    # Start the debate process
    socketio.emit('debate_started', {
        "debate_id": debate_id,
        "topic": topic,
        "agents": AGENTS
    })
    
    return jsonify({"debate_id": debate_id})

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('user_intervention')
def handle_user_intervention(data):
    debate_id = data.get('debate_id')
    intervention = data.get('intervention')
    
    if debate_id not in debates:
        return
    
    # Store the intervention
    message_data = {
        "type": "intervention",
        "content": intervention,
        "timestamp": datetime.now().isoformat(),
        "sender": "user"
    }
    
    debates[debate_id]["messages"].append(message_data)
    
    # Emit the intervention to all clients
    emit('new_intervention', {
        "debate_id": debate_id,
        "intervention": intervention
    }, broadcast=True)

def generate_agent_response(agent, context, topic):
    """Generate a response from an AI agent."""
    try:
        if not generator:
            # Fallback response if model is not initialized
            return f"As {agent['name']}, I believe that {topic} requires careful consideration from my perspective as {agent['role']}. {agent['bias']}. This is a complex issue that needs to be addressed thoughtfully, taking into account various factors and potential impacts."

        # Format context to include only the last 5 messages
        recent_context = context[-5:] if len(context) > 5 else context
        context_str = "\n".join([
            f"{msg['sender']}: {msg['content']}"
            for msg in recent_context
        ])

        # Create a more structured system prompt
        system_prompt = f"""You are {agent['name']}, a {agent['role']} participating in a formal debate about: {topic}

Your expertise and perspective: {agent['bias']}

Previous discussion:
{context_str}

Provide a focused analysis (maximum 100 words) that:
1. Directly addresses the topic of {topic}
2. Incorporates your expertise as {agent['role']}
3. Considers economic, social, and ethical implications
4. Maintains a formal, academic tone
5. Concludes with a clear, final thought

Your response should be a complete paragraph with a proper conclusion. Do not end mid-sentence or mid-thought."""

        # Generate response with improved parameters
        response = generator(
            system_prompt,
            max_new_tokens=150,  # Shorter for more focused responses
            temperature=0.7,      # Slightly higher temperature for more creative responses
            top_p=0.9,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
            num_return_sequences=1,
            repetition_penalty=1.2,
            no_repeat_ngram_size=3
        )[0]['generated_text']

        # Clean up the response
        response = response.replace(system_prompt, "").strip()
        if response.startswith("Assistant:"):
            response = response[10:].strip()
        if response.startswith("Human:"):
            response = response[6:].strip()
        
        # Ensure the response is appropriate
        if len(response.split()) < 10 or "Your response:" in response or any(casual in response.lower() for casual in ["thanks", "email", "reach out", "hope this helps", "lmfao"]):
            # Create a more meaningful fallback response
            if agent["name"] == "Economist":
                return f"As an Economist, I believe eliminating standardized tests would impact university admissions by reducing objective metrics. This could lead to increased reliance on subjective criteria, potentially affecting economic efficiency in higher education. However, the current system may not accurately predict student success, suggesting a need for reform rather than elimination."
            elif agent["name"] == "Ethicist":
                return f"As an Ethicist, I question whether standardized tests fairly evaluate diverse student backgrounds. These tests may perpetuate systemic inequalities, as they often favor students with access to test preparation resources. A more equitable approach would consider multiple factors that better reflect a student's potential and character."
            elif agent["name"] == "Environmentalist":
                return f"As an Environmentalist, I see little direct environmental impact from standardized tests themselves. However, the broader education system they support has significant environmental implications. If eliminating these tests leads to more holistic admissions that value environmental activism and sustainability initiatives, this could positively influence campus culture and practices."
            elif agent["name"] == "Social Worker":
                return f"As a Social Worker, I'm concerned about how standardized tests affect vulnerable student populations. These tests often create barriers for students from disadvantaged backgrounds, limiting their access to higher education. Eliminating this requirement could open doors for many qualified students who excel in ways not measured by standardized tests."
            else:
                return f"As {agent['name']}, I believe that {topic} requires careful consideration from my perspective as {agent['role']}. {agent['bias']}. This is a complex issue that needs to be addressed thoughtfully, taking into account various factors and potential impacts."
        
        # Check if response ends with a complete sentence
        if not response.endswith(('.', '!', '?')):
            # Find the last complete sentence
            last_period = response.rfind('.')
            last_exclamation = response.rfind('!')
            last_question = response.rfind('?')
            
            last_end = max(last_period, last_exclamation, last_question)
            
            if last_end > 0:
                response = response[:last_end+1]
            else:
                # If no complete sentence found, add a conclusion
                response += " This is my perspective on the matter."
        
        # Limit response length to approximately 100 words
        words = response.split()
        if len(words) > 100:
            # Find the last complete sentence within the 100-word limit
            truncated = " ".join(words[:100])
            last_period = truncated.rfind('.')
            last_exclamation = truncated.rfind('!')
            last_question = truncated.rfind('?')
            
            last_end = max(last_period, last_exclamation, last_question)
            
            if last_end > 0:
                response = truncated[:last_end+1]
            else:
                response = truncated + "..."
        
        return response

    except Exception as e:
        print(f"Error generating response: {str(e)}")
        # Fallback response with error handling
        return f"I apologize, but I encountered an error while generating my response. As {agent['name']}, I would normally analyze {topic} from my perspective as {agent['role']}, focusing on {agent['bias']}. Please try again in a moment."

@socketio.on('start_agent_turn')
def handle_agent_turn(data):
    try:
        debate_id = data.get('debate_id')
        agent = data.get('agent')
        
        if not debate_id or not agent:
            print("Error: Missing debate_id or agent information")
            socketio.emit('error', {
                "message": "Missing debate_id or agent information"
            })
            return
        
        if debate_id not in debates:
            print(f"Error: Invalid debate ID {debate_id}")
            socketio.emit('error', {
                "message": "Invalid debate ID"
            })
            return
        
        print(f"Starting turn for agent: {agent['name']} in debate: {debate_id}")
        
        # Emit typing indicator - use socketio.emit instead of emit
        socketio.emit('typing_status', {
            "debate_id": debate_id,
            "agent": agent,
            "is_typing": True
        })
        
        # Get debate context
        debate_data = debates[debate_id]
        
        # Generate response
        context = debate_data["messages"][-5:] if len(debate_data["messages"]) > 5 else debate_data["messages"]
        
        print(f"Generating response for {agent['name']}...")
        response = generate_agent_response(agent, context, debate_data["topic"])
        print(f"Response generated for {agent['name']}")
        
        # Store the response
        message_data = {
            "type": "agent_message",
            "content": response,
            "timestamp": datetime.now().isoformat(),
            "sender": agent["name"],
            "role": agent["role"]
        }
        
        debate_data["messages"].append(message_data)
        
        # Emit the response - use socketio.emit instead of emit
        socketio.emit('new_message', {
            "debate_id": debate_id,
            "message": message_data
        })

        # Emit typing indicator off - use socketio.emit instead of emit
        socketio.emit('typing_status', {
            "debate_id": debate_id,
            "agent": agent,
            "is_typing": False
        })

        # Find the next agent
        try:
            current_agent_index = next(i for i, a in enumerate(AGENTS) if a["name"] == agent["name"])
            next_agent_index = (current_agent_index + 1) % len(AGENTS)
            next_agent = AGENTS[next_agent_index]
            
            print(f"Current agent: {agent['name']}, Next agent: {next_agent['name']}")
            
            # Schedule next agent's turn after a longer delay to prevent rate limiting
            socketio.sleep(5)  # Increased delay to 5 seconds
            
            # Use socketio.emit to broadcast the event to all clients
            socketio.emit('start_agent_turn', {
                "debate_id": debate_id,
                "agent": next_agent
            })
            
            print(f"Scheduled next turn for agent: {next_agent['name']}")
        except Exception as e:
            print(f"Error scheduling next agent: {str(e)}")
            # Don't raise the error, as the current response was successful
            
    except Exception as e:
        print(f"Error in handle_agent_turn: {str(e)}")
        socketio.emit('error', {
            "message": "An error occurred while processing the agent's turn"
        })
        
        # Turn off typing indicator in case of error
        socketio.emit('typing_status', {
            "debate_id": debate_id,
            "agent": agent,
            "is_typing": False
        })

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5001))
    socketio.run(app, debug=True, port=port, host='0.0.0.0') 