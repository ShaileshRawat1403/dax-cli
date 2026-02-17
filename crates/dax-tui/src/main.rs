use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, Paragraph, Scrollbar, ScrollbarState},
    Frame, Terminal,
};
use serde::{Deserialize, Serialize};
use std::io::{self, BufRead};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

struct Theme {
    bg: Color,
    text: Color,
    dim: Color,
    border: Color,
    accent: Color,
    success: Color,
    warning: Color,
    error: Color,
    user: Color,
    assistant: Color,
}

impl Theme {
    fn default() -> Self {
        Self {
            bg: Color::Reset,
            text: Color::White,
            dim: Color::DarkGray,
            border: Color::DarkGray,
            accent: Color::Cyan,
            success: Color::Green,
            warning: Color::Yellow,
            error: Color::Red,
            user: Color::LightBlue,
            assistant: Color::LightGreen,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TuiMessage {
    #[serde(rename = "dispatch")]
    Dispatch { event: StreamEvent },
    #[serde(rename = "addUserMessage")]
    AddUserMessage { content: String },
    #[serde(rename = "setContext")]
    SetContext {
        files: Vec<String>,
        scope: Vec<String>,
    },
    #[serde(rename = "updateState")]
    UpdateState { state: String },
    #[serde(rename = "destroy")]
    Destroy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum StreamEvent {
    #[serde(rename = "meta")]
    Meta {
        provider: Option<String>,
        model: Option<String>,
    },
    #[serde(rename = "state")]
    State { state: String },
    #[serde(rename = "text_delta")]
    TextDelta { text: String },
    #[serde(rename = "tool_call")]
    ToolCall {
        name: Option<String>,
        id: Option<String>,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_id: Option<String>,
        success: Option<bool>,
        output: Option<String>,
        elapsed_ms: Option<u64>,
    },
    #[serde(rename = "gate")]
    Gate {
        id: Option<String>,
        blocked: Option<bool>,
        warnings: Option<Vec<Warning>>,
    },
    #[serde(rename = "complete")]
    Complete,
    #[serde(rename = "error")]
    Error { message: Option<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Warning {
    pub code: String,
    pub subject: String,
}

#[derive(Default)]
struct AppState {
    messages: Vec<Message>,
    current_stream: String,
    stream_state: String,
    current_tool: Option<String>,
    tools: Vec<ToolState>,
    context_files: Vec<String>,
    context_scope: Vec<String>,
    input: String,
    scroll_state: ScrollbarState,
    chat_scroll: usize,
    provider: Option<String>,
    model: Option<String>,
    elapsed_ms: Option<u64>,
}

#[derive(Default, Clone)]
struct Message {
    role: String,
    content: String,
    timestamp: u64,
    tools: Vec<ToolState>,
}

#[derive(Default, Clone)]
struct ToolState {
    name: String,
    id: String,
    status: String,
    output: Option<String>,
    elapsed_ms: Option<u64>,
}

fn main() -> io::Result<()> {
    // Check if we have a TTY, but try anyway if it's a pseudo-TTY (works in most IDEs)
    let allow_pipe = std::env::var("DAX_TUI_ALLOW_PIPE").unwrap_or_default() == "1";
    if !allow_pipe && !atty::is(atty::Stream::Stdin) && !atty::is(atty::Stream::Stdout) {
        eprintln!("Error: TUI requires a real terminal.");
        eprintln!("");
        eprintln!("To run the TUI:");
        eprintln!("  1. Open a new Terminal window");
        eprintln!("  2. cd to the dax-cli project directory");
        eprintln!("  3. Run: npm run tui:ratatui");
        std::process::exit(1);
    }

    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut state = AppState::default();
    state.stream_state = "done".to_string();

    let (tx, rx) = mpsc::channel::<String>();

    thread::spawn(move || {
        let stdin = io::stdin();
        let mut handle = stdin.lock();

        loop {
            let mut buffer = String::new();
            match handle.read_line(&mut buffer) {
                Ok(0) => break,
                Ok(_) => {
                    let trimmed = buffer.trim();
                    if !trimmed.is_empty() {
                        let _ = tx.send(trimmed.to_string());
                    }
                }
                Err(_) => break,
            }
        }
    });

    loop {
        terminal.draw(|f| ui(f, &mut state))?;

        while let Ok(msg) = rx.try_recv() {
            if let Ok(tui_msg) = serde_json::from_str::<TuiMessage>(&msg) {
                match tui_msg {
                    TuiMessage::Dispatch { event } => match event {
                        StreamEvent::State { state: s } => state.stream_state = s,
                        StreamEvent::TextDelta { text } => state.current_stream.push_str(&text),
                        StreamEvent::ToolCall { name, id } => {
                            state.current_tool = name.clone();
                            if let (Some(name), Some(id)) = (name, id) {
                                state.tools.push(ToolState {
                                    name,
                                    id,
                                    status: "running".to_string(),
                                    output: None,
                                    elapsed_ms: None,
                                });
                            }
                        }
                        StreamEvent::ToolResult {
                            tool_id,
                            success,
                            output,
                            elapsed_ms,
                        } => {
                            state.current_tool = None;
                            for tool in &mut state.tools {
                                if tool.id == tool_id.clone().unwrap_or_default() {
                                    tool.status = if success.clone().unwrap_or(false) {
                                        "success".to_string()
                                    } else {
                                        "error".to_string()
                                    };
                                    tool.output = output;
                                    tool.elapsed_ms = elapsed_ms;
                                    break;
                                }
                            }
                        }
                        StreamEvent::Complete => {
                            if !state.current_stream.is_empty() || !state.tools.is_empty() {
                                let tools = state.tools.clone();
                                state.messages.push(Message {
                                    role: "assistant".to_string(),
                                    content: state.current_stream.clone(),
                                    timestamp: std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .unwrap_or_default()
                                        .as_millis()
                                        as u64,
                                    tools,
                                });
                                state.current_stream.clear();
                                state.tools.clear();
                                state.stream_state = "idle".to_string();
                                state.chat_scroll = state.messages.len().saturating_sub(1);
                            }
                        }
                        StreamEvent::Meta { provider, model } => {
                            state.provider = provider;
                            state.model = model;
                        }
                        StreamEvent::Error { .. } => {
                            state.stream_state = "error".to_string();
                        }
                        StreamEvent::Gate { .. } => {
                            state.stream_state = "waiting".to_string();
                        }
                    },
                    TuiMessage::AddUserMessage { content } => {
                        state.messages.push(Message {
                            role: "user".to_string(),
                            content,
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64,
                            tools: vec![],
                        });
                        state.current_stream.clear();
                        state.stream_state = "thinking".to_string();
                    }
                    TuiMessage::SetContext { files, scope } => {
                        state.context_files = files;
                        state.context_scope = scope;
                    }
                    TuiMessage::UpdateState { state: s } => {
                        state.stream_state = s;
                    }
                    TuiMessage::Destroy => {
                        disable_raw_mode()?;
                        execute!(
                            terminal.backend_mut(),
                            LeaveAlternateScreen,
                            DisableMouseCapture
                        )?;
                        terminal.show_cursor()?;
                        return Ok(());
                    }
                }
            }
        }

        if event::poll(Duration::from_millis(50))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    match key.code {
                        KeyCode::Char('c')
                            if key
                                .modifiers
                                .contains(crossterm::event::KeyModifiers::CONTROL) =>
                        {
                            disable_raw_mode()?;
                            execute!(
                                terminal.backend_mut(),
                                LeaveAlternateScreen,
                                DisableMouseCapture
                            )?;
                            terminal.show_cursor()?;
                            return Ok(());
                        }
                        KeyCode::Enter => {
                            if !state.input.is_empty() {
                                let input = state.input.clone();
                                let msg = serde_json::json!({
                                    "type": "input",
                                    "content": input
                                });
                                println!("{}", msg);
                                state.input.clear();
                            }
                        }
                        KeyCode::Char(c) => {
                            state.input.push(c);
                        }
                        KeyCode::Backspace => {
                            state.input.pop();
                        }
                        KeyCode::Up => {
                            if state.chat_scroll > 0 {
                                state.chat_scroll -= 1;
                            }
                        }
                        KeyCode::Down => {
                            if state.chat_scroll < state.messages.len().saturating_sub(1) {
                                state.chat_scroll += 1;
                            }
                        }
                        KeyCode::PageUp => {
                            state.chat_scroll = state.chat_scroll.saturating_sub(10);
                        }
                        KeyCode::PageDown => {
                            state.chat_scroll = (state.chat_scroll + 10)
                                .min(state.messages.len().saturating_sub(1));
                        }
                        KeyCode::Home => {
                            state.chat_scroll = 0;
                        }
                        KeyCode::End => {
                            state.chat_scroll = state.messages.len().saturating_sub(1);
                        }
                        _ => {}
                    }
                }
            }
        }
    }
}

fn ui(frame: &mut Frame, state: &mut AppState) {
    // OpenCode.ai style dark theme colors
    let theme = Theme::default();

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(0),
            Constraint::Length(6),
        ])
        .split(frame.area());

    // Header with status
    let (status_color, status_text) = match state.stream_state.as_str() {
        "request_sent" | "thinking" => (theme.accent, "⟳ Thinking"),
        "awaiting_first_token" => (theme.warning, "◐ Waiting"),
        "streaming" => (theme.success, "▮ Streaming"),
        "tool_executing" => (theme.accent, "⚙ Tools"),
        "waiting" => (theme.warning, "⚠ Gate"),
        "error" => (theme.error, "✕ Error"),
        _ => (theme.dim, "✓ Ready"),
    };

    let provider_info = match (&state.provider, &state.model) {
        (Some(p), Some(m)) => format!(" • {}:{}", p, m),
        (Some(p), None) => format!(" • {}", p),
        _ => String::new(),
    };

    // Header block with gradient-style title
    let header = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(theme.border))
        .title(Span::styled(
            format!("  DAX {} {} ", status_text, provider_info),
            Style::default().fg(status_color).bold(),
        ));
    frame.render_widget(header, chunks[0]);

    // Main content area
    let main_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(70), Constraint::Percentage(30)])
        .split(chunks[1]);

    // Chat area with custom styling
    let chat_block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(theme.border))
        .title(Span::styled(" Chat ", Style::default().fg(theme.dim)));
    frame.render_widget(&chat_block, main_chunks[0]);

    let chat_area = Rect::new(
        main_chunks[0].x + 1,
        main_chunks[0].y + 1,
        main_chunks[0].width.saturating_sub(2),
        main_chunks[0].height.saturating_sub(2),
    );

    let mut chat_lines: Vec<Line> = Vec::new();

    for (i, msg) in state.messages.iter().enumerate() {
        let is_current = i == state.chat_scroll;
        let role_color = if msg.role == "user" {
            theme.user
        } else if msg.role == "assistant" {
            theme.assistant
        } else {
            theme.error
        };

        let role_label = if msg.role == "user" { "You" } else { "DAX" };

        let prefix = if is_current { "▶" } else { "▸" };
        chat_lines.push(Line::from(vec![
            Span::styled(prefix, Style::default().fg(theme.accent).bold()),
            Span::styled(
                format!(" {} ", role_label),
                Style::default().fg(role_color).bold(),
            ),
        ]));

        for line in msg.content.lines() {
            chat_lines.push(Line::from(vec![Span::raw("   "), Span::raw(line)]));
        }

        if !msg.tools.is_empty() {
            chat_lines.push(Line::from(vec![Span::raw("")]));
            for tool in &msg.tools {
                let tool_color = match tool.status.as_str() {
                    "success" => theme.success,
                    "error" => theme.error,
                    "running" => theme.warning,
                    _ => theme.dim,
                };
                let icon = match tool.status.as_str() {
                    "success" => "✓",
                    "error" => "✕",
                    "running" => "◐",
                    _ => "○",
                };
                let elapsed = tool
                    .elapsed_ms
                    .map(|e| format!(" {}ms", e))
                    .unwrap_or_default();
                chat_lines.push(Line::from(vec![
                    Span::raw("   "),
                    Span::styled(
                        format!("{} {}", icon, tool.name),
                        Style::default().fg(tool_color).bold(),
                    ),
                    Span::styled(elapsed, Style::default().fg(theme.dim)),
                ]));
            }
        }

        chat_lines.push(Line::from(vec![Span::raw("")]));
    }

    // Current streaming message
    if !state.current_stream.is_empty() {
        chat_lines.push(Line::from(vec![
            Span::styled("▸ ", Style::default().fg(theme.assistant).bold()),
            Span::styled("DAX ", Style::default().fg(theme.assistant).bold()),
        ]));
        for line in state.current_stream.lines() {
            chat_lines.push(Line::from(vec![Span::raw("   "), Span::raw(line)]));
        }

        if let Some(tool_name) = &state.current_tool {
            chat_lines.push(Line::from(vec![
                Span::raw(""),
                Span::styled(
                    format!("   ◐ running: {}", tool_name),
                    Style::default().fg(theme.warning),
                ),
            ]));
        }
    }

    let chat_lines_count = chat_lines.len();
    let chat_list = List::new(chat_lines);
    frame.render_widget(chat_list, chat_area);

    if chat_lines_count > chat_area.height as usize {
        let scrollbar = Scrollbar::default();
        state.scroll_state = state.scroll_state.content_length(chat_lines_count);
        frame.render_stateful_widget(scrollbar, chat_area, &mut state.scroll_state);
    }

    // Sidebar with context
    let sidebar_block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(theme.border))
        .title(Span::styled(" Context ", Style::default().fg(theme.dim)));
    frame.render_widget(sidebar_block, main_chunks[1]);

    let sidebar_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
        .split(main_chunks[1]);

    // Context - Files
    let files_text = if state.context_files.is_empty() {
        "No files loaded".to_string()
    } else {
        state.context_files.join("\n")
    };
    let files_para = Paragraph::new(files_text).style(Style::default().fg(theme.text));
    frame.render_widget(
        files_para,
        Rect::new(
            sidebar_chunks[0].x + 1,
            sidebar_chunks[0].y + 1,
            sidebar_chunks[0].width.saturating_sub(2),
            sidebar_chunks[0].height.saturating_sub(2),
        ),
    );

    // Context - Scope
    let scope_text = if state.context_scope.is_empty() {
        "No scope defined".to_string()
    } else {
        state.context_scope.join("\n")
    };
    let scope_para = Paragraph::new(scope_text).style(Style::default().fg(theme.text));
    frame.render_widget(
        scope_para,
        Rect::new(
            sidebar_chunks[1].x + 1,
            sidebar_chunks[1].y + 1,
            sidebar_chunks[1].width.saturating_sub(2),
            sidebar_chunks[1].height.saturating_sub(2),
        ),
    );

    // Input area
    let input_block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(theme.accent))
        .title(Span::styled(" Input ", Style::default().fg(theme.dim)));
    frame.render_widget(input_block, chunks[2]);

    let input_text = Paragraph::new(state.input.as_str()).style(Style::default().fg(theme.text));
    let input_cursor = if state.input.is_empty() { "▊" } else { "" };
    frame.render_widget(
        Paragraph::new(format!("{}{}", state.input, input_cursor))
            .style(Style::default().fg(theme.text)),
        Rect::new(
            chunks[2].x + 1,
            chunks[2].y + 1,
            chunks[2].width.saturating_sub(2),
            chunks[2].height.saturating_sub(2),
        ),
    );
}
