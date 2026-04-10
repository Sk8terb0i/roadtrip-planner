import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import TripPlanner from "./pages/TripPlanner";

function App() {
  return (
    <Router basename="/roadtrip-planner">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/trip/:tripId" element={<TripPlanner />} />
      </Routes>
    </Router>
  );
}

export default App;
