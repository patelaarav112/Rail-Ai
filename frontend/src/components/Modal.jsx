export default function Modal({ show, onClose, title, children, width = '580px' }) {
  if (!show) return null;
  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ width, maxWidth: '95vw' }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
