import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { AuthGate } from "./components/AuthGate";
import { Layout } from "./components/Layout";
import { SignalList } from "./pages/SignalList";
import { SignalEditor } from "./pages/SignalEditor";
import { ResearchTopic } from "./pages/ResearchTopic";
import { DraftReview } from "./pages/DraftReview";

export function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<SignalList />} />
              <Route path="/signals/:id" element={<SignalEditor />} />
              <Route path="/research" element={<ResearchTopic />} />
              <Route path="/drafts/:draftId" element={<DraftReview />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </AuthGate>
    </AuthProvider>
  );
}
