import { Outlet } from "react-router";
import Filterurl from "./components/Filterurl/Filterurl";
import Chatbot from "./components/Chatbot/Chatbot";

export default function DashboardLayout() {
  return (
    <div className="min-h-screen bg-neutral-900 text-white">
      {/* Always show Filter bar at the top */}
      <Filterurl />

      {/* Nested routes will render here */}
      <div className="p-4">
        <Outlet />
      </div>

      <Chatbot />
    </div>
  );
}
