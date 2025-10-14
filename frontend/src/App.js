import { useState, useEffect, useRef } from "react";
import "@/App.css";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Send, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [command, setCommand] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    // Add welcome message
    setMessages([
      {
        role: "assistant",
        content: "Hello! I'm your AI Sales Report Generator assistant. I'll help you create a command to generate your sales report. To get started, I need two pieces of information: the start date and end date for your report. What date range would you like to analyze?",
        timestamp: new Date().toISOString()
      }
    ]);
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = {
      role: "user",
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await axios.post(`${API}/chat`, {
        session_id: sessionId,
        message: input
      });

      const assistantMessage = {
        role: "assistant",
        content: response.data.response,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (response.data.command) {
        setCommand(response.data.command);
        toast.success("Command generated successfully!");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyCommand = () => {
    if (command) {
      navigator.clipboard.writeText(command);
      toast.success("Command copied to clipboard!");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="max-w-5xl mx-auto py-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <FileText className="w-12 h-12 text-indigo-600" />
            <h1 className="text-4xl font-bold text-gray-900">AI Sales Report Generator</h1>
          </div>
          <p className="text-gray-600 text-lg">Chat with AI to generate your sales report command</p>
        </div>

        <div className="grid gap-6">
          {/* Chat Interface */}
          <Card className="shadow-lg" data-testid="chat-card">
            <CardHeader>
              <CardTitle>Chat Assistant</CardTitle>
              <CardDescription>Tell me the date range for your sales report</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Messages Area */}
                <ScrollArea className="h-[400px] border rounded-lg p-4 bg-white" ref={scrollRef}>
                  <div className="space-y-4">
                    {messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        data-testid={`message-${msg.role}-${idx}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-2 ${
                            msg.role === "user"
                              ? "bg-indigo-600 text-white"
                              : "bg-gray-100 text-gray-900"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    {loading && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 rounded-lg px-4 py-2">
                          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Input Area */}
                <form onSubmit={sendMessage} className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type your message here..."
                    disabled={loading}
                    className="flex-1"
                    data-testid="chat-input"
                  />
                  <Button type="submit" disabled={loading || !input.trim()} data-testid="send-button">
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>

          {/* Command Output */}
          {command && (
            <Card className="shadow-lg border-green-200 bg-green-50" data-testid="command-card">
              <CardHeader>
                <CardTitle className="text-green-900">Generated Command</CardTitle>
                <CardDescription className="text-green-700">
                  Copy this command and run it on your Windows computer
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <code data-testid="generated-command">{command}</code>
                  </div>
                  <Button
                    onClick={copyCommand}
                    className="w-full"
                    variant="outline"
                    data-testid="copy-command-button"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Command
                  </Button>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-900 mb-2">Instructions:</h4>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
                      <li>Copy the command above</li>
                      <li>Open Command Prompt on your Windows computer</li>
                      <li>Navigate to <code className="bg-blue-100 px-1 rounded">c:\s4v6\</code></li>
                      <li>Paste and run the command</li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Info Footer */}
        <Card className="mt-6 bg-gray-50">
          <CardContent className="pt-6">
            <div className="text-center text-sm text-gray-600">
              <p className="mb-2">💡 <strong>Tip:</strong> You can provide dates in various formats</p>
              <p className="text-xs text-gray-500">
                Examples: "01/15/2024", "January 15, 2024", "1/15/24"
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default App;