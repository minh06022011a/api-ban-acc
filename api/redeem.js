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

        // 2. MÃ NGON! PHI SANG NGUYENLIEUMMO MUA HÀNG
        const nguyenLieuApiUrl = 'https://nguyenlieummo.vn/api/buy';
        
        const formData = new URLSearchParams();
        // Bơm cả 2 kiểu api_key và apikey vì nhiều web MMO code rất ngáo
        formData.append('apikey', process.env.NL_API_KEY); 
        formData.append('api_key', process.env.NL_API_KEY);
        formData.append('action', 'buyProduct');
        formData.append('id', process.env.NL_PRODUCT_ID);
        formData.append('amount', '1'); 

        console.log("Bắt đầu phi sang web nguồn mua hàng...");
        
        const nlResponse = await fetch(nguyenLieuApiUrl, {
            method: 'POST',
            body: formData,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // Đọc dữ liệu thô để bắt lỗi tường lửa Cloudflare
        const rawText = await nlResponse.text(); 
        console.log("Web nguồn trả về cục này: ", rawText);

        let nlData;
        try {
            nlData = JSON.parse(rawText);
        } catch(e) {
            console.error("Lỗi Parse JSON - Bị tường lửa chặn!");
            return res.status(500).json({ error: "Bị tường lửa của web nguồn chặn mọe nó rồi (Cloudflare)!" });
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
