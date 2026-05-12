import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { code } = req.query;

    if (!code) return res.status(400).json({ error: "Sếp chưa nhập mã code kìa!" });

    try {
        // 1. KIỂM TRA MÃ SUPABASE
        const { data: voucher, error: dbError } = await supabase
            .from('vouchers').select('*').eq('code', code).eq('is_used', false).single();

        if (dbError || !voucher) {
            return res.status(400).json({ error: "Mã không hợp lệ hoặc đã bị húp rồi!" });
        }

        // 2. MUA HÀNG VỚI LINK CHUẨN BUY_PRODUCT
        const apiKey = process.env.NL_API_KEY;
        const productId = process.env.NL_PRODUCT_ID;
        const nguyenLieuApiUrl = 'https://nguyenlieummo.vn/api/buy_product';

        console.log("Cầm đúng chìa khóa rồi, phi thẳng vào kho lấy hàng...");
        
        // Đóng gói dữ liệu gửi đi (bơm cả api_key và apikey đề phòng nó bắt bẻ)
        const formData = new URLSearchParams();
        formData.append('api_key', apiKey);
        formData.append('apikey', apiKey); 
        formData.append('id', productId);
        formData.append('amount', '1');

        const nlResponse = await fetch(nguyenLieuApiUrl, {
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                // Vẫn đeo mặt nạ Chrome để chống Cloudflare
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/javascript, */*; q=0.01'
            },
            body: formData
        });

        // Đọc dữ liệu nó nhả ra
        const rawText = await nlResponse.text(); 
        console.log("Web nguồn trả về: ", rawText);

        let nlData;
        try {
            nlData = JSON.parse(rawText);
        } catch(e) {
            return res.status(500).json({ error: "Nó nhả ra cục lỗi lạ: " + rawText.substring(0, 100) });
        }

        // 3. NHẬN HÀNG VÀ CHỐT ĐƠN
        if (nlData.status === 'success' || nlData.status === true || nlData.status === 200 || nlData.message === 'Thành công') {
            // Mua ngon ơ -> Khóa cái mã voucher lại
            await supabase.from('vouchers').update({ is_used: true }).eq('id', voucher.id);
            
            // Moi con Mail Edu ra trả về màn hình cho sếp
            const thongTinMail = nlData.data || nlData.list || JSON.stringify(nlData);
            return res.status(200).json({ success: true, data: thongTinMail });
        } else {
            // Hết tiền, sai ID, bảo trì... thì nó báo ở đây
            return res.status(500).json({ error: "Web nguồn từ chối bán: " + (nlData.msg || nlData.message || "Không rõ lý do") });
        }

    } catch (err) {
        return res.status(500).json({ error: "Lỗi hệ thống Vercel: " + err.message });
    }
}
