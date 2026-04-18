import "./App.css";

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1 className="brand">Aura</h1>
          <p className="tagline">Atmospheric Intelligence</p>
        </div>
      </header>

      <main className="bento">
        <section className="bento-hero">Current weather</section>
        <section className="bento-chart">Hourly chart</section>
        <section className="bento-forecast">7-day forecast</section>
        <section className="bento-aqi">Air quality</section>
        <section className="bento-uv">UV index</section>
        <section className="bento-sun">Sun times</section>
      </main>
    </div>
  );
}

export default App;