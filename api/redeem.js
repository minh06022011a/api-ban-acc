import { createClient } from '@supabase/supabase-js';

// Khởi tạo kết nối Supabase (Sếp giấu URL và Key vào file .env trên Vercel)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    // Cho phép gọi chéo miền (CORS) để web mặt tiền gọi được
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ error: "Sếp chưa nhập mã code kìa!" });
    }

    try {
        // 1. CHUI VÀO SUPABASE KIỂM TRA MÃ
        const { data: voucher, error: dbError } = await supabase
            .from('vouchers')
            .select('*')
            .eq('code', code)
            .eq('is_used', false)
            .single(); // Chỉ lấy 1 dòng

        if (dbError || !voucher) {
            return res.status(400).json({ error: "Mã không hợp lệ hoặc đã bị thằng khác húp rồi!" });
        }

        // 2. MÃ NGON! PHI SANG NGUYENLIEUMMO MUA HÀNG
        const nguyenLieuApiUrl = 'https://nguyenlieummo.vn/api/buy';
        
        // Setup gói dữ liệu form-data chuẩn bài
        const formData = new URLSearchParams();
        formData.append('action', 'buyProduct');
        formData.append('id', process.env.NL_PRODUCT_ID); // ID loại acc trên NguyenLieuMMO (Giấu ở .env)
        formData.append('amount', '1'); // Đang test hệ 1 đổi 1
        formData.append('api_key', process.env.NL_API_KEY); // API Key bí mật của sếp (Giấu ở .env)

        const nlResponse = await fetch(nguyenLieuApiUrl, {
            method: 'POST',
            body: formData,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const nlData = await nlResponse.json();

        if (nlData.status === 'success') {
            // 3. MUA THÀNH CÔNG! KHÓA MÃ TRÊN SUPABASE LẠI NGAY LẬP TỨC
            await supabase
                .from('vouchers')
                .update({ is_used: true })
                .eq('id', voucher.id);

            // 4. TRẢ HÀNG CHO KHÁCH
            return res.status(200).json({ 
                success: true, 
                data: nlData.data // Đây là chuỗi Mail Edu bên kia nhả về
            });
        } else {
            // Lỗi từ phía NguyenLieuMMO (Hết hàng, hết tiền...)
            return res.status(500).json({ error: "Kho nguồn đang bảo trì hoặc hết hàng, vui lòng báo lại Shop!" });
        }

    } catch (err) {
        return res.status(500).json({ error: "Lỗi hệ thống máy chủ, rớt mạng rớt màng!" });
    }
}
