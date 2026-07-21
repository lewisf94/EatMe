import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../api";

/** A printed QR label opens /i/:qrUid — resolve it to its product and jump to
 *  that product's screen (where the current pack's quick-tap lives). */
export default function QrRedirect() {
  const { qrUid = "" } = useParams();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getQr(qrUid).then(
      (d) => {
        if (d.product) nav(`/product/${d.product.id}`, { replace: true });
        else setError("This label isn’t linked to a product yet.");
      },
      (e) => setError(e instanceof Error ? e.message : "That label wasn’t found."),
    );
  }, [qrUid, nav]);

  if (error)
    return (
      <div className="py-12 text-center text-slate-600">
        <p className="mb-1 font-semibold">Couldn’t open that label.</p>
        <p className="text-sm text-slate-500">{error}</p>
        <Link to="/" className="mt-4 inline-block text-sm text-emerald-600">
          ← Back to cupboard
        </Link>
      </div>
    );
  return <p className="py-8 text-center text-slate-400">Opening…</p>;
}
