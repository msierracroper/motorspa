import { formatCOP, WORK_ORDER_TYPE_LABEL } from '@motospa/shared';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useOrder } from '@/api/operations';
import { Button } from '@/components/ui/button';
import { formatPlate } from '@/lib/plate';
import { formatDateTime } from '@/lib/hooks';

/** Ticket de ingreso y recibo de pago para impresora térmica de 80 mm (D-13). */
export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const order = useOrder(id);
  const [qr, setQr] = useState<string | null>(null);
  const o = order.data;

  useEffect(() => {
    if (!o) return;
    void QRCode.toDataURL(`MOTOSPA:${o.number}:${o.id}`, { margin: 0, width: 160 }).then(setQr);
  }, [o]);

  if (!o) return <p className="p-6 text-muted-foreground">Cargando ticket…</p>;
  const items = o.items.filter((i) => i.status !== 'CANCELLED');

  return (
    <div className="flex min-h-dvh flex-col items-center gap-4 bg-muted py-6 print:block print:bg-white print:py-0">
      <style>{`
        @page { size: 80mm auto; margin: 3mm; }
        @media print { body { background: #fff !important; } }
      `}</style>
      <div className="flex gap-2 print:hidden">
        <Button size="touch" onClick={() => window.print()}>
          Imprimir
        </Button>
        <Button
          size="touch"
          variant="outline"
          className="rounded-full bg-card"
          onClick={() => window.close()}
        >
          Cerrar
        </Button>
      </div>

      <article className="w-[72mm] bg-white p-3 font-mono text-[12px] leading-snug text-black shadow-soft print:w-full print:p-0 print:shadow-none">
        <header className="text-center">
          <p className="text-base font-bold">MOTOSPA</p>
          <p>Lavadero y parqueadero de motos</p>
          <p>Sede Principal</p>
        </header>
        <Divider />
        <p className="text-center text-[11px]">
          {o.payment ? 'RECIBO DE PAGO' : 'TICKET DE INGRESO'}
        </p>
        <p className="text-center text-2xl font-bold tracking-widest">
          {formatPlate(o.motorcycle.plate)}
        </p>
        <Line label="Orden" value={`#${o.number}`} />
        <Line label="Ingreso" value={formatDateTime(o.checkedInAt)} />
        <Line label="Tipo" value={WORK_ORDER_TYPE_LABEL[o.type]} />
        {o.spotCode && <Line label="Cupo" value={o.spotCode} />}
        {o.customer && <Line label="Cliente" value={o.customer.fullName} />}

        {items.length > 0 && (
          <>
            <Divider />
            {items.map((i) => (
              <Line key={i.id} label={i.description} value={formatCOP(i.unitPrice)} />
            ))}
          </>
        )}

        {o.belongings.length > 0 && (
          <>
            <Divider />
            <p>
              Pertenencias:{' '}
              {o.belongings
                .map((b) => `${b.item}${b.quantity > 1 ? ` x${b.quantity}` : ''}`)
                .join(', ')}
            </p>
          </>
        )}

        {o.payment && (
          <>
            <Divider />
            <Line label="Servicios" value={formatCOP(o.payment.servicesAmount)} />
            {o.payment.parkingAmount > 0 && (
              <Line label="Parqueo" value={formatCOP(o.payment.parkingAmount)} />
            )}
            {o.payment.discount > 0 && (
              <Line label="Descuento" value={`-${formatCOP(o.payment.discount)}`} />
            )}
            <Line label="TOTAL" value={formatCOP(o.payment.total)} bold />
            <Line label="Recibo" value={`#${o.payment.number}`} />
            <Line label="Fecha" value={formatDateTime(o.payment.createdAt)} />
          </>
        )}

        <Divider />
        {qr && (
          <img src={qr} alt={`Código de la orden ${o.number}`} className="mx-auto h-28 w-28" />
        )}
        <p className="mt-2 text-center text-[11px]">
          {o.payment ? '¡Gracias por tu visita!' : 'Presenta este ticket para retirar tu moto.'}
        </p>
        <p className="text-center text-[10px]">Documento no válido como factura</p>
      </article>
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      className={
        bold ? 'flex justify-between gap-2 text-sm font-bold' : 'flex justify-between gap-2'
      }
    >
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

function Divider() {
  return <hr className="my-2 border-t border-dashed border-black" />;
}
