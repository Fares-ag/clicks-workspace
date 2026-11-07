import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/app_colors.dart';

class MembershipPlansScreen extends StatefulWidget {
  const MembershipPlansScreen({super.key});

  @override
  State<MembershipPlansScreen> createState() => _MembershipPlansScreenState();
}

class _MembershipPlansScreenState extends State<MembershipPlansScreen> {
  List<Map<String, dynamic>> _plans = [];
  var _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final res = await DioHelper.getData(url: EndPoints.subscriptionPlans);
    if (!mounted) return;
    if (res.statusCode == 200 && res.data is Map) {
      final list = (res.data as Map)['plans'];
      setState(() {
        _plans = list is List
            ? list.map((e) => Map<String, dynamic>.from(e as Map)).toList()
            : [];
        _loading = false;
      });
    } else {
      setState(() {
        _loading = false;
        _error = DioHelper.errorMessage(res) ?? 'Failed to load plans';
      });
    }
  }

  String _prices(Map<String, dynamic> plan) {
    final intervals = plan['intervals'];
    if (intervals is! List) return '';
    return intervals
        .whereType<Map>()
        .map((row) {
          final interval = row['interval']?.toString() ?? '';
          final price = row['priceQar']?.toString() ?? '';
          return '$interval QAR $price';
        })
        .join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          final saved = await Navigator.of(context).pushNamed(Routes.membershipPlanNew);
          if (saved == true) _load();
        },
        child: const Icon(Icons.add),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: _plans.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final plan = _plans[index];
                      final id = plan['_id']?.toString() ?? plan['id']?.toString() ?? '';
                      final active = plan['active'] != false;
                      return ListTile(
                        tileColor: Colors.white,
                        title: Text(
                          plan['name_en']?.toString() ?? plan['code']?.toString() ?? 'Plan',
                          style: GoogleFonts.dmSans(fontWeight: FontWeight.w600),
                        ),
                        subtitle: Text(
                          '${_prices(plan)}\n${plan['discountPercent'] ?? 0}% off other services'
                          '${plan['coversEmergency'] == true ? ' · emergencies covered' : ''}',
                        ),
                        isThreeLine: true,
                        trailing: Text(
                          active ? 'Active' : 'Off',
                          style: TextStyle(
                            color: active ? AppColors.success : AppColors.danger,
                          ),
                        ),
                        onTap: () async {
                          final saved = await Navigator.of(context).pushNamed(
                            Routes.membershipPlanEditPath(id),
                          );
                          if (saved == true) _load();
                        },
                      );
                    },
                  ),
                ),
    );
  }
}
