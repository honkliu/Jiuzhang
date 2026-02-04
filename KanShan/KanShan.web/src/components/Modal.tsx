import { type ReactNode } from "react";

export function Modal(props: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modalOverlay" onMouseDown={props.onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">{props.title}</div>
          <button className="btn btnGhost" onClick={props.onClose}>
            Close
          </button>
        </div>
        <div className="modalBody">{props.children}</div>
      </div>
    </div>
  );
}
