import { render } from "preact";
import { App } from "./components/App.js";
import "./styles.css";
import "./liquid-glass.css";

render(<App />, document.getElementById("app")!);
