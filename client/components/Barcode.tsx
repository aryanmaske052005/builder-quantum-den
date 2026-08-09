import { useEffect, useRef, useState } from "react";
// @ts-ignore
import JsBarcode from "jsbarcode";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle, Download } from "lucide-react";
import { toast } from "sonner";

interface BarcodeProps {
  value: string;
  displayValue?: boolean;
  height?: number;
  width?: number;
  lineColor?: string;
  margin?: number;
}

export function Barcode({
  value,
  displayValue = true,
  height = 40,
  width = 2,
  lineColor = "#000000",
  margin = 10,
}: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          width: width,
          height: height,
          displayValue: displayValue,
          lineColor: lineColor,
          background: "transparent",
          margin: margin,
          fontSize: 12,
          fontOptions: "bold",
          font: "monospace",
        });
      } catch (err) {
        console.error("JsBarcode generation failed:", err);
      }
    }
  }, [value, displayValue, height, width, lineColor, margin]);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("Barcode value copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!svgRef.current) return;
    try {
      const svgString = new XMLSerializer().serializeToString(svgRef.current);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);
      const downloadLink = document.createElement("a");
      downloadLink.href = svgUrl;
      downloadLink.download = `barcode_${value}.svg`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(svgUrl);
      toast.success("Barcode downloaded as SVG!");
    } catch (err) {
      toast.error("Failed to download barcode");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-slate-900/40 border border-slate-800 rounded-xl backdrop-blur-sm max-w-full">
      <div className="bg-white p-4 rounded-lg shadow-inner max-w-full overflow-x-auto flex justify-center items-center">
        <svg ref={svgRef} className="max-w-full" />
      </div>
      
      <div className="flex gap-2 mt-3 w-full">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="flex-1 bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-750 text-xs h-8"
        >
          {copied ? (
            <CheckCircle className="h-3.5 w-3.5 mr-1 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 mr-1" />
          )}
          Copy Value
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          className="flex-1 bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-750 text-xs h-8"
        >
          <Download className="h-3.5 w-3.5 mr-1" />
          Download
        </Button>
      </div>
    </div>
  );
}
