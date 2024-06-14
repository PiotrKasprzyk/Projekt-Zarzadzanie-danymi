from flask import Flask, request, jsonify, session, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_cors import CORS

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///monuments.db'
app.config['SECRET_KEY'] = 'your_secret_key'
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
CORS(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)

class Marker(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(200), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('markers', lazy=True))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify(success=False, message='Invalid data'), 400

    hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')
    new_user = User(username=data['username'], password=hashed_password)
    db.session.add(new_user)
    db.session.commit()
    return jsonify(success=True)

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(username=data['username']).first()
    if user and bcrypt.check_password_hash(user.password, data['password']):
        session['user_id'] = user.id
        return jsonify(success=True, user_id=user.id)
    else:
        return jsonify(success=False)

@app.route('/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify(success=True)

@app.route('/add_marker', methods=['POST'])
def add_marker():
    if 'user_id' not in session:
        return jsonify(success=False, message='Unauthorized')
    
    data = request.get_json()
    try:
        new_marker = Marker(lat=data['lat'], lng=data['lng'], title=data['title'], description=data['description'], user_id=session['user_id'])
        db.session.add(new_marker)
        db.session.commit()
        return jsonify(success=True, id=new_marker.id)
    except Exception as e:
        return jsonify(success=False, message=str(e))

@app.route('/get_markers', methods=['GET'])
def get_markers():
    try:
        markers = Marker.query.all()
        marker_list = [{'id': marker.id, 'lat': marker.lat, 'lng': marker.lng, 'title': marker.title, 'description': marker.description, 'user_id': marker.user_id} for marker in markers]
        return jsonify(marker_list)
    except Exception as e:
        return jsonify(success=False, message=str(e))

@app.route('/edit_marker/<int:marker_id>', methods=['POST'])
def edit_marker(marker_id):
    if 'user_id' not in session:
        return jsonify(success=False, message='Unauthorized')
    
    data = request.get_json()
    try:
        marker = Marker.query.get(marker_id)
        if marker and marker.user_id == session['user_id']:
            print(f'Updating marker {marker_id} with data: {data}')
            marker.title = data['title']
            marker.description = data['description']
            marker.lat = data['lat']
            marker.lng = data['lng']
            db.session.commit()
            print(f'Marker {marker_id} updated successfully')
            return jsonify(success=True)
        return jsonify(success=False, message='Marker not found or not authorized')
    except Exception as e:
        print(f'Error updating marker {marker_id}: {e}')
        return jsonify(success=False, message=str(e))

@app.route('/delete_marker/<int:marker_id>', methods=['POST'])
def delete_marker(marker_id):
    if 'user_id' not in session:
        return jsonify(success=False, message='Unauthorized')
    
    try:
        marker = Marker.query.get(marker_id)
        if marker and marker.user_id == session['user_id']:
            db.session.delete(marker)
            db.session.commit()
            return jsonify(success=True)
        return jsonify(success=False, message='Marker not found or not authorized')
    except Exception as e:
        return jsonify(success=False, message=str(e))

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)
