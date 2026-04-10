import { HashRouter as Router, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import TripPlanner from "./pages/TripPlanner";

function App() {
  return (
    // Note: With HashRouter, you usually remove the 'basename' prop
    // because the hash handles the pathing relative to the root.
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/trip/:tripId" element={<TripPlanner />} />
      </Routes>
    </Router>
  );
}

export default App;
