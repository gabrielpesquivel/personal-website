import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import './styles/App.css';
import Navbar from './components/Navbar';
import City from './components/City';
import Newspaper from './components/Newspaper';
import Chatbot from "./components/Chatbot";

// The city is always on screen; /blog opens the newspaper on top of it.
function Shell() {
  const location = useLocation();
  return (
    <>
      <Navbar />
      <City />
      {location.pathname === '/blog' && <Newspaper />}
      <Chatbot />
    </>
  );
}

function App() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Router>
      <div className="App">
        <div className={`main-content ${visible ? 'fade-in' : ''}`}>
          <Shell />
        </div>
      </div>
    </Router>
  );
}

export default App;
