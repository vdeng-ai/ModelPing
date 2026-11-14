import { render } from "preact";
import { App } from "./components/App.js";
import "./design-system/tokens.css";
import "./styles.css";
import "./design-system/layout.css";
import "./design-system/workbench.css";

render(<App />, document.getElementById("app")!);
