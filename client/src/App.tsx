import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Signals from "./pages/Signals";
import Agent from "./pages/Agent";
import Ideas from "./pages/Ideas";
import MySystem from "./pages/MySystem";
import SignalPromptConfig from "./pages/SignalPromptConfig";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/signals"} component={Signals} />
      <Route path={"/signals/prompt-config"} component={SignalPromptConfig} />
      <Route path={"/agent"} component={Agent} />
      <Route path={"/ideas"} component={Ideas} />
      <Route path={"/my-system"} component={MySystem} />
      <Route path={"/my-ai"}>{() => { window.location.replace("/agent"); return null; }}</Route>
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
