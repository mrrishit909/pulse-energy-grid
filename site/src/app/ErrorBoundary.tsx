import { Component, type ReactNode } from "react";

interface State { error: Error | null }

/** Last-resort boundary: a mono error line with a real reload, never a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal" role="alert">
        <p className="state-line state-line--error">SOMETHING BROKE WHILE DRAWING THIS PAGE ({this.state.error.message.toUpperCase()})</p>
        <button type="button" className="btn-square" onClick={() => location.reload()}>RELOAD</button>
      </div>
    );
  }
}
