import './Loader.css';

function Loader({ label = 'Loading...', size = 'md', inline = false }) {
  const sizeClass = `loader--${size}`;
  const inlineClass = inline ? 'loader--inline' : '';

  return (
    <div className={`loader ${sizeClass} ${inlineClass}`.trim()} role="status" aria-live="polite">
      <span className="loader-spinner" aria-hidden="true"></span>
      <span className="loader-text">{label}</span>
    </div>
  );
}

export default Loader;
