import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { code } = req.query;

    if (!code) return res.status(400).json({ error: "Sếp chưa nhập mã code kìa!" });

    try {
        // 1. CHUI VÀO SUPABASE KIỂM TRA MÃ VOUCHER
        const { data: voucher, error: dbError } = await supabase
            .from('vouchers').select('*').eq('code', code).eq('is_used', false).single();

        if (dbError || !voucher) {
            return res.status(400).json({ error: "Mã không hợp lệ hoặc đã bị thằng khác húp rồi!" });
        }

        // 2. PHI SANG BUY.PHP ĐỂ CHỐT ĐƠN
        const apiKey = process.env.NL_API_KEY;
        const productId = process.env.NL_PRODUCT_ID;
        
        // Link mua hàng chuẩn: dùng buy.php và nạp đủ action, id, amount
        const nguyenLieuApiUrl = `https://nguyenlieummo.vn/api/buy.php?api_key=${apiKey}&action=buyProduct&id=${productId}&amount=1`;

        console.log("Đang cầm tiền phi vào buy.php mua hàng...");
        
        const nlResponse = await fetch(nguyenLieuApiUrl, {
            method: 'GET', 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/javascript, */*; q=0.01'
            }
        });

        const rawText = await nlResponse.text(); 
        console.log("Web nguồn phản hồi: ", rawText);

        let nlData;
        try {
            nlData = JSON.parse(rawText);
        } catch(e) {
            // Nếu nó báo File not found thì mình in ra để soi lỗi
            return res.status(500).json({ error: "Web nguồn báo: " + rawText });
        }

        // Kiểm tra xem nó có nhả hàng không
        if (nlData.status === 'success' || nlData.status === true || nlData.status === 200) {
            // MUA THÀNH CÔNG -> CẬP NHẬT SUPABASE
            await supabase.from('vouchers').update({ is_used: true }).eq('id', voucher.id);
            
            // Lấy dữ liệu mail (thường nằm trong nlData.data hoặc nlData.list)
            const thongTinMail = nlData.data || nlData.list || JSON.stringify(nlData);
            return res.status(200).json({ success: true, data: thongTinMail });
        } else {
            // Lỗi từ phía web (hết tiền, sai key...)
            return res.status(500).json({ error: "Web nguồn từ chối: " + (nlData.msg || nlData.message || "Lỗi không xác định") });
        }

    } catch (err) {
        return res.status(500).json({ error: "Lỗi hệ thống: " + err.message });
    }
}
