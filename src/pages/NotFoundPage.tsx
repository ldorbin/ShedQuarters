import { Link } from "react-router";
import { TopBar } from "../components/Layout";
import { useShell } from "../App";

export function NotFoundPage() {
  const shell = useShell();

  return (
    <>
      <TopBar title="Page not found" onOpenMenu={shell?.openMenu} />
      <div className="page">
        <div className="card">
          <div className="empty-state">
            <h3>That page doesn't exist</h3>
            <p>The link may be out of date, or the document may have been deleted.</p>
            <Link className="btn btn-primary" to="/">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
