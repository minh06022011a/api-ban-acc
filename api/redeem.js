import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { code } = req.query;

    if (!code) return res.status(400).json({ error: "Sếp chưa nhập mã code kìa!" });

    try {
        // 1. CHUI VÀO SUPABASE KIỂM TRA MÃ
        const { data: voucher, error: dbError } = await supabase
            .from('vouchers').select('*').eq('code', code).eq('is_used', false).single();

        if (dbError || !voucher) {
            return res.status(400).json({ error: "Mã không hợp lệ hoặc đã bị thằng khác húp rồi!" });
        }

        // 2. LẮP RÁP ĐƯỜNG LINK GET CHUẨN ĐUÔI .PHP
        // Dùng đúng cấu trúc: /api/buy.php?api_key=...&action=buyProduct&id=...&amount=1
        const apiKey = process.env.NL_API_KEY;
        const productId = process.env.NL_PRODUCT_ID;
        const nguyenLieuApiUrl = `https://nguyenlieummo.vn/api/buy.php?api_key=${apiKey}&action=buyProduct&id=${productId}&amount=1`;

        console.log("Đang phi xe máy gọi API bằng lệnh GET...");
        
        const nlResponse = await fetch(nguyenLieuApiUrl, {
            method: 'GET',
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/javascript, */*; q=0.01'
            }
        });

        // Đọc dữ liệu
        const rawText = await nlResponse.text(); 
        console.log("Web nguồn trả về: ", rawText);

        let nlData;
        try {
            nlData = JSON.parse(rawText);
        } catch(e) {
            return res.status(500).json({ error: "Bị block mọe rồi, nó trả về cục này: " + rawText.substring(0, 100) });
        }

        if (nlData.status === 'success' || nlData.status === true || nlData.status === 200) {
            // MUA THÀNH CÔNG -> KHÓA MÃ LẠI
            await supabase.from('vouchers').update({ is_used: true }).eq('id', voucher.id);
            return res.status(200).json({ success: true, data: nlData.data || nlData.list || "Mua thành công!" });
        } else {
            // LỖI TỪ PHÍA WEB NGUỒN (Hết tiền, sai key, sai ID...)
            return res.status(500).json({ error: "Từ chối bán: " + (nlData.msg || nlData.message || "Không rõ lý do") });
        }

    } catch (err) {
        console.error("LỖI MÁY CHỦ SẬP NGUỒN:", err);
        return res.status(500).json({ error: "Bệnh án hệ thống: " + err.message });
    }
}
