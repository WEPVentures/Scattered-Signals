import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { AuthGate } from "./components/AuthGate";
import { Layout } from "./components/Layout";
import { SignalList } from "./pages/SignalList";
import { SignalEditor } from "./pages/SignalEditor";

export function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<SignalList />} />
              <Route path="/signals/:id" element={<SignalEditor />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </AuthGate>
    </AuthProvider>
  );
}
