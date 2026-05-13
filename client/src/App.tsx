import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Signals from "./pages/Signals";
import SignalPromptConfig from "./pages/SignalPromptConfig";
import SystemHealth from "./pages/SystemHealth";
import Agent from "./pages/Agent";
import Ideas from "./pages/Ideas";
import MySystem from "./pages/MySystem";
import { TradeCompanion } from "./pages/TradeCompanion";
import { TradeCompanionList } from "./pages/TradeCompanionList";
import SignalMonitoring from "./pages/SignalMonitoring";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/signals"} component={Signals} />
      <Route path={"/signals/prompt-config"} component={SignalPromptConfig} />
      <Route path={"/system-health"} component={SystemHealth} />
      <Route path={"/agent"} component={Agent} />
      <Route path={"/ideas"} component={Ideas} />
      <Route path={"/my-system"} component={MySystem} />
      <Route path={"/my-ai"}>{() => { window.location.replace("/agent"); return null; }}</Route>
      {/* Trade Companion routes */}
      <Route path={"/trade-companion"} component={TradeCompanionList} />
      <Route path={"/trade-companion/new"}>{() => <TradeCompanion />}</Route>
      <Route path={"/trade-companion/:id"}>{(params: { id: string }) => <TradeCompanion companionId={parseInt(params.id)} />}</Route>
      {/* Signal Monitoring route */}
      <Route path={"/signal-monitoring"} component={SignalMonitoring} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
