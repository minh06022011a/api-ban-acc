import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        const { data: hiddenData } = await supabase.from('vouchers').select('account_data').eq('code', 'SYS_HIDDEN_PRODUCTS').single();
        const { data: nameData } = await supabase.from('vouchers').select('account_data').eq('code', 'SYS_CUSTOM_NAMES').single();
        
        return res.status(200).json({ 
            hidden: hiddenData && hiddenData.account_data ? JSON.parse(hiddenData.account_data) : [],
            customNames: nameData && nameData.account_data ? JSON.parse(nameData.account_data) : {}
        });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ nhận POST/GET' });

    const { userKey, productId, action } = req.body;
    if (!userKey) return res.status(400).json({ error: "Thiếu dữ liệu Key!" });

    try {
        const { data: keyData, error: dbError } = await supabase.from('vouchers').select('*').eq('code', userKey).single();
        if (dbError || !keyData) return res.status(400).json({ error: "Key xịt hoặc đéo tồn tại!" });

        if (action === 'check') {
            if (!keyData.is_used) return res.status(400).json({ error: "Key này CÒN ZIN, chưa mua hàng lần nào!" });
            const thoiGian = new Date(keyData.used_at).toLocaleString('vi-VN');
            return res.status(200).json({ success: true, isCheck: true, data: keyData.account_data, time: thoiGian });
        }

        if (keyData.is_used) {
            return res.status(400).json({ error: `Key này đã dùng rồi sếp ơi! Vui lòng bấm "🔎 Tra Cứu Lại Key" để xem Acc!` });
        }

        // BÀI THUỐC FIX LỖI GIAN LẬN Ở ĐÂY SẾP NHÉ: ÉP VỀ CHỮ TRƯỚC KHI SO SÁNH
        if (String(keyData.product_id) !== String(productId)) {
            return res.status(400).json({ error: "Gian lận! Sai món hàng!" });
        }

        const apiKey = process.env.NL_API_KEY; 
        const formData = new URLSearchParams();
        formData.append('api_key', apiKey); 
        formData.append('action', 'buyProduct'); 
        formData.append('id', productId); 
        formData.append('amount', '1');

        const nlResponse = await fetch('https://nguyenlieummo.vn/api/buy_product', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });

        const nlData = await nlResponse.json();

        if (nlData.status === 'success' || nlData.status === true || nlData.status === 200 || nlData.message === 'Thành công') {
            let thongTinHang = nlData.data || nlData.list || JSON.stringify(nlData);
            
            if (Array.isArray(thongTinHang)) thongTinHang = thongTinHang.join('\n');
            else if (typeof thongTinHang !== 'string') thongTinHang = JSON.stringify(thongTinHang);
            thongTinHang = thongTinHang.replace(/[\[\]"]/g, '').replace(/\\n/g, '\n').trim();
            
            await supabase.from('vouchers').update({ 
                is_used: true, 
                used_at: new Date().toISOString(), 
                account_data: thongTinHang 
            }).eq('id', keyData.id);
            
            return res.status(200).json({ success: true, data: thongTinHang });
        } else {
            return res.status(400).json({ error: "Sàn báo: " + (nlData.msg || nlData.message) });
        }
    } catch (err) {
        return res.status(500).json({ error: "Lỗi hệ thống: " + err.message });
    }
}
