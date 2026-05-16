import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ nhận POST' });

    const { userKey, productId } = req.body;
    if (!userKey || !productId) return res.status(400).json({ error: "Thiếu dữ liệu!" });

    try {
        // 1. TÌM KEY TRONG KÉT SẮT
        const { data: keyData, error: dbError } = await supabase
            .from('vouchers').select('*').eq('code', userKey).single();

        if (dbError || !keyData) return res.status(400).json({ error: "Key xịt hoặc đéo tồn tại!" });

        // 2. CHECK XEM KEY DÙNG CHƯA
        if (keyData.is_used) {
            // Chửi thẳng mặt kèm thời gian dùng chính xác
            const thoiGian = new Date(keyData.used_at).toLocaleString('vi-VN');
            return res.status(400).json({ error: `Key này đã bị thằng nào húp vào lúc ${thoiGian} rồi sếp ơi!` });
        }

        // 3. CHECK XEM CÓ MUA SAI SẢN PHẨM KHÔNG (ĐÚNG Ý SẾP)
        if (keyData.product_id !== productId) {
            return res.status(400).json({ error: "Gian lận! Key này đéo dùng để mua món hàng này!" });
        }

        // 4. MUA HÀNG TRÊN NGUYENLIEUMMO
        const apiKey = process.env.NL_API_KEY; 
        const nguyenLieuApiUrl = 'https://nguyenlieummo.vn/api/buy_product';
        
        const formData = new URLSearchParams();
        formData.append('apikey', apiKey); 
        formData.append('action', 'buyProduct'); 
        formData.append('id', productId); 
        formData.append('amount', '1');

        const nlResponse = await fetch(nguyenLieuApiUrl, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });

        const rawText = await nlResponse.text(); 
        let nlData = JSON.parse(rawText);

        if (nlData.status === 'success' || nlData.status === true || nlData.status === 200 || nlData.message === 'Thành công') {
            const thongTinHang = nlData.data || nlData.list || JSON.stringify(nlData);
            
            // 5. LƯU BẰNG CHỨNG VÀO SUPABASE (LƯU LỊCH SỬ TỪNG GIÂY)
            await supabase.from('vouchers').update({ 
                is_used: true, // Đánh dấu đã dùng
                used_at: new Date().toISOString(), // Lưu giờ phút giây phút hiện tại
                account_data: typeof thongTinHang === 'string' ? thongTinHang : JSON.stringify(thongTinHang) // Lưu bằng chứng acc
            }).eq('id', keyData.id);
            
            return res.status(200).json({ success: true, data: thongTinHang });
        } else {
            return res.status(400).json({ error: "Sàn hết hàng hoặc lỗi: " + (nlData.msg || nlData.message) });
        }

    } catch (err) {
        return res.status(500).json({ error: "Lỗi hệ thống: " + err.message });
    }
}
