import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Fade,
  useTheme,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { Socket as ClientSocket } from 'socket.io-client/build/esm/socket';

const AGENTS = [
  {
    name: "Economist",
    role: "Economic policy expert",
    bias: "Focused on economic efficiency and market dynamics"
  },
  {
    name: "Ethicist",
    role: "Moral philosophy specialist",
    bias: "Concerned with ethical implications and human rights"
  },
  {
    name: "Social Worker",
    role: "Social policy specialist",
    bias: "Focused on social welfare and community impact"
  }
];
const AGENT_COLORS: { [key: string]: string } = {
  Economist: '#90caf9', // light blue
  Ethicist: '#a5d6a7',  // light green
  Environmentalist: '#ffe082', // light yellow
  'Social Worker': '#f48fb1', // light pink
  User: '#ce93d8', // purple for user interventions
};


interface Agent {
  name: string;
  role: string;
  bias: string;
}

interface Message {
  type: string;
  content: string;
  timestamp: string;
  sender: string;
  role?: string;
}

interface DebateState {
  active: boolean;
  topic: string;
  agents: Agent[];
  messages: Message[];
}

interface TypingStatus {
  agent: Agent;
  is_typing: boolean;
}

interface DebateInterfaceProps {
  debateState: DebateState;
  setDebateState: React.Dispatch<React.SetStateAction<DebateState>>;
  socket: ClientSocket;
}


const DebateInterface: React.FC<DebateInterfaceProps> = ({
  debateState,
  setDebateState,
  socket,
}) => {
  const theme = useTheme();
  const [topic, setTopic] = useState('');
  const [intervention, setIntervention] = useState('');
  const [debateId, setDebateId] = useState<string | null>(null);
  const [typingStatus, setTypingStatus] = useState<TypingStatus | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    socket.on('typing_status', (data: { debate_id: string; agent: Agent; is_typing: boolean }) => {
      if (data.debate_id === debateId) {
        setTypingStatus({
          agent: data.agent,
          is_typing: data.is_typing
        });
      }
    });
  
    socket.on('start_agent_turn', (data: { debate_id: string; agent: Agent }) => {
      if (data.debate_id === debateId) {
        socket.emit('start_agent_turn', data);
      }
    });
  
    return () => {
      socket.off('typing_status');
      socket.off('start_agent_turn');
    };
  }, [socket, debateId]);  
  useEffect(() => {
    scrollToBottom();
  }, [debateState.messages]);

  useEffect(() => {
    socket.on('typing_status', (data: { debate_id: string; agent: Agent; is_typing: boolean }) => {
      if (data.debate_id === debateId) {
        setTypingStatus({
          agent: data.agent,
          is_typing: data.is_typing
        });
      }
    });

    return () => {
      socket.off('typing_status');
    };
  }, [socket, debateId]);

  const startDebate = async () => {
    if (!topic.trim()) return;

    try {
      const response = await fetch('https://ai-deliberation.onrender.com/api/start_debate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic }),
      });

      const data = await response.json();
      setDebateId(data.debate_id);
      
      // Update the debate state
      setDebateState(prev => ({
        ...prev,
        active: true,
        topic: topic,
        agents: [],
        messages: []
      }));

      // Trigger the first agent turn
      socket.emit('start_agent_turn', {
        debate_id: data.debate_id,
        agent: AGENTS[0]  // Start with the first agent
      });
    } catch (error) {
      console.error('Error starting debate:', error);
    }
  };

  const sendIntervention = () => {
    if (!intervention.trim() || !debateId) return;

    socket.emit('user_intervention', {
      debate_id: debateId,
      intervention: intervention.trim(),
    });

    setIntervention('');
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
      <Button
        variant="outlined"
        color="error"
        size="small"
        onClick={() => {
          setDebateId(null);
          setTopic('');
          setIntervention('');
          setTypingStatus(null);
          setDebateState({
            active: false,
            topic: '',
            agents: [],
            messages: []
          });
        }}
      >
        Reset Debate
      </Button>
    </Box>
      {!debateState.active ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h5" gutterBottom>
            Start a New Debate
          </Typography>
          <TextField
            fullWidth
            label="Enter a topic for debate"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={startDebate}
            disabled={!topic.trim()}
          >
            Start Debate
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Paper
            elevation={3}
            sx={{
              p: 2,
              mb: 2,
              backgroundColor: 'background.paper',
              borderRadius: 2
            }}
          >
            <Typography variant="h6" gutterBottom>
              Topic: {debateState.topic}
            </Typography>
          </Paper>
          <Paper
            elevation={3}
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              mb: 2,
              backgroundColor: 'background.paper',
              borderRadius: 2,
              overflow: 'hidden'
            }}
          >
            <Box
              sx={{
                flex: 1,
                overflow: 'auto',
                p: 2,
                maxHeight: 'calc(100vh - 400px)',
                minHeight: '400px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {debateState.messages.map((message, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: message.type === 'intervention' ? 'flex-end' : 'flex-start',
                    mb: 2,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      mb: 0.5,
                      flexDirection: message.type === 'intervention' ? 'row-reverse' : 'row',
                    }}
                  >
                    <Chip
                      label={message.sender}
                      color={message.type === 'intervention' ? 'secondary' : 'primary'}
                      size="small"
                      sx={{ 
                        mx: 1,
                        backgroundColor: AGENT_COLORS[message.sender] || undefined,
                        color: 'black'
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </Typography>
                  </Box>
                  <Paper
                    elevation={1}
                    sx={{
                      p: 1.5,
                      maxWidth: '80%',
                      backgroundColor: AGENT_COLORS[message.sender] || 'primary.dark',
                      borderRadius: 2,
                      position: 'relative',
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        [message.type === 'intervention' ? 'right' : 'left']: -10,
                        borderStyle: 'solid',
                        borderWidth: '10px 10px 0 0',
                        borderColor: `${message.type === 'intervention' 
                          ? theme.palette.secondary.dark 
                          : theme.palette.primary.dark} transparent transparent transparent`,
                        transform: message.type === 'intervention' ? 'none' : 'scaleX(-1)',
                      }
                    }}
                  >
                    <Typography
                      variant="body1"
                      sx={{
                        color: 'common.white',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}
                    >
                      {message.content}
                    </Typography>
                  </Paper>
                </Box>
              ))}
              <div ref={messagesEndRef} />
              
            <Fade in={typingStatus?.is_typing ?? false}>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, ml: 2 }}>
                <Chip
                  label={typingStatus?.agent.name}
                  color="primary"
                  size="small"
                  sx={{ 
                    mr: 1, 
                    backgroundColor: typingStatus?.agent?.name && AGENT_COLORS[typingStatus.agent.name]? AGENT_COLORS[typingStatus.agent.name]: 'primary.dark',
                    color: 'black'
                  }}
                />
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1,
                    alignItems: 'center',
                    p: 1,
                    px: 2,
                    borderRadius: 2,
                    backgroundColor: typingStatus?.agent?.name && AGENT_COLORS[typingStatus.agent.name]
                    ? AGENT_COLORS[typingStatus.agent.name]
                    : 'primary.dark',
                    animation: 'pulse 1.5s ease-in-out infinite',
                    '@keyframes pulse': {
                      '0%': { opacity: 0.5 },
                      '50%': { opacity: 1 },
                      '100%': { opacity: 0.5 },
                    },
                  }}
                >
                  <Typography variant="body2" color="common.white">
                    typing
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {[0, 1, 2].map((dot) => (
                      <Box
                        key={dot}
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          backgroundColor: 'common.white',
                          animation: 'typing-dot 1.4s infinite',
                          animationDelay: `${dot * 0.2}s`,
                          '@keyframes typing-dot': {
                            '0%, 60%, 100%': {
                              transform: 'translateY(0)',
                            },
                            '30%': {
                              transform: 'translateY(-4px)',
                            },
                          },
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              </Box>
            </Fade>

            </Box>

            <Box
              sx={{
                p: 2,
                borderTop: 1,
                borderColor: 'divider',
                backgroundColor: 'background.paper',
              }}
            >
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  placeholder="Add your intervention..."
                  value={intervention}
                  onChange={(e) => setIntervention(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendIntervention()}
                  variant="outlined"
                  size="small"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 3,
                    },
                  }}
                />
                <Tooltip title="Send intervention">
                  <IconButton
                    color="primary"
                    onClick={sendIntervention}
                    disabled={!intervention.trim()}
                    sx={{
                      backgroundColor: 'primary.main',
                      color: 'common.white',
                      '&:hover': {
                        backgroundColor: 'primary.dark',
                      },
                      '&.Mui-disabled': {
                        backgroundColor: 'action.disabledBackground',
                      },
                    }}
                  >
                    <SendIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          </Paper>
        </Box>
      )}
    </Box>
  );
};

export default DebateInterface; 