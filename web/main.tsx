import { render } from "preact";
import { App } from "./components/App.js";
import "./styles.css";
import "./design-system/tokens.css";
import "./design-system/materials.css";
import "./design-system/motion.css";
import "./design-system/components.css";

render(<App />, document.getElementById("app")!);
