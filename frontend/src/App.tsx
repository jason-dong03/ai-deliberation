import React, { useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Container, Box, Typography, Paper } from '@mui/material';
import DebateInterface from './components/DebateInterface';
import { Socket as ClientSocket } from 'socket.io-client/build/esm/socket';
import io from 'socket.io-client';

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

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#f48fb1',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
});

const socket = io('http://localhost:5001', {
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 10000,
  forceNew: true
}) as unknown as ClientSocket;

function App() {
  const [debateState, setDebateState] = useState<DebateState>({
    active: false,
    topic: '',
    agents: [],
    messages: [],
  });

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('debate_started', (data: { topic: string; agents: Agent[] }) => {
      setDebateState(prev => ({
        ...prev,
        active: true,
        topic: data.topic,
        agents: data.agents,
      }));
    });

    socket.on('new_message', (data: { message: Message }) => {
      setDebateState(prev => ({
        ...prev,
        messages: [...prev.messages, data.message],
      }));
    });

    socket.on('new_intervention', (data: { intervention: string }) => {
      setDebateState(prev => ({
        ...prev,
        messages: [...prev.messages, {
          type: 'intervention',
          content: data.intervention,
          timestamp: new Date().toISOString(),
          sender: 'user',
        }],
      }));
    });

    return () => {
      socket.off('connect');
      socket.off('debate_started');
      socket.off('new_message');
      socket.off('new_intervention');
    };
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg">
        <Box sx={{ my: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom align="center">
            AI Deliberatorium
          </Typography>
          <Paper elevation={3} sx={{ p: 3, mt: 4 }}>
            <DebateInterface
              debateState={debateState}
              setDebateState={setDebateState}
              socket={socket}
            />
          </Paper>
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App;
