import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import FraudRadar from './pages/FraudRadar'
import Report from './pages/Report'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/radar" element={<FraudRadar />} />
          <Route path="/report/:companyId" element={<Report />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
export default App