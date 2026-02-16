import React from "react";
import { createRoot } from "react-dom/client";
import Game from "../Game.jsx";

function App(){
  return <Game />;
}

createRoot(document.getElementById("root")).render(<App />);
